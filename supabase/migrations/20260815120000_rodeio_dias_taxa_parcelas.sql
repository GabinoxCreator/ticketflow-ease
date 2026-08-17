-- ============================================================================
-- Rodeio de Novo Horizonte — fundação do Bloco 1
-- Data: 15/08/2026
--
-- O QUE ESTA MIGRATION FAZ
--   1. Cria `event_days`: a lista canônica de dias operacionais de um evento,
--      cada um com sua janela 12h→06h. São as "5 portas" do ingresso permanente.
--   2. Liga o lote a um dia (avulso) ou marca que ele cobre todos (permanente).
--   3. Dá ao lote o `modo_taxa` (absorve | cliente_paga) e o `max_parcelas`.
--
-- POR QUE É SEGURA PARA PRODUÇÃO
--   · Só ADIÇÃO. Nenhum DROP, nenhum ALTER destrutivo, nenhum backfill.
--   · Todo default REPRODUZ o comportamento de hoje:
--       - modo_taxa = 'cliente_paga'  → taxa somada por cima, como sempre foi;
--       - max_parcelas = NULL         → sem limite, como sempre foi;
--       - covers_all_days = false + event_day_id NULL → lote sem noção de dia.
--     Ou seja: nenhum evento existente muda de comportamento ao rodar isto.
--   · NENHUM código lê estas colunas ainda. Rodar hoje e usar semana que vem
--     é seguro; rodar e nunca usar também é.
--   · Reversível: o rollback está no fim do arquivo, comentado.
--
-- COMO RODAR
--   Colar no SQL Editor do projeto nsrromaqysgoxqvqagdm. Rodar UMA vez.
--   Idempotente (IF NOT EXISTS em tudo) — rodar duas vezes não quebra.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. event_days — os dias operacionais do evento
-- ----------------------------------------------------------------------------
-- A janela é DADO, não constante de código: cada dia carrega o próprio
-- opens_at/closes_at. Isso permite abrir o sábado mais cedo sem tocar em código,
-- e é a mesma tabela que a máquina de acesso vai usar em outubro para resolver
-- "em que noite esse check-in caiu".

CREATE TABLE IF NOT EXISTS public.event_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  day_date    date        NOT NULL,   -- a "noite de 08/out"
  label       text        NULL,       -- 'QUA', 'QUI'... p/ a pulseira impressa
  sort_order  smallint    NOT NULL DEFAULT 0,

  -- Janela operacional COMPLETA deste dia (12h→06h do dia seguinte).
  -- closes_at > opens_at é garantido por CHECK: janela invertida é bug de
  -- cadastro, e é melhor o banco recusar do que a portaria descobrir às 3h.
  opens_at    timestamptz NOT NULL,
  closes_at   timestamptz NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT event_days_unique_dia    UNIQUE (event_id, day_date),
  CONSTRAINT event_days_janela_valida CHECK (closes_at > opens_at)
);

CREATE INDEX IF NOT EXISTS idx_event_days_event ON public.event_days(event_id, day_date);

-- Busca por janela: "que dia operacional contém este instante?"
CREATE INDEX IF NOT EXISTS idx_event_days_janela ON public.event_days(event_id, opens_at, closes_at);

ALTER TABLE public.event_days ENABLE ROW LEVEL SECURITY;

-- Leitura: mesma regra dos lotes — público vê de evento publicado, produtor vê o seu.
DROP POLICY IF EXISTS "Dias de eventos publicados sao visiveis" ON public.event_days;
CREATE POLICY "Dias de eventos publicados sao visiveis"
ON public.event_days FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = event_days.event_id
      AND (events.status = 'published' OR events.producer_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Produtores podem criar dias" ON public.event_days;
CREATE POLICY "Produtores podem criar dias"
ON public.event_days FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = event_days.event_id AND events.producer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Produtores podem atualizar dias" ON public.event_days;
CREATE POLICY "Produtores podem atualizar dias"
ON public.event_days FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = event_days.event_id AND events.producer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Produtores podem apagar dias" ON public.event_days;
CREATE POLICY "Produtores podem apagar dias"
ON public.event_days FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = event_days.event_id AND events.producer_id = auth.uid()
  )
);


-- ----------------------------------------------------------------------------
-- 2. event_lots — o lote passa a saber que dia ele cobre
-- ----------------------------------------------------------------------------
-- Avulso  → event_day_id preenchido, covers_all_days = false
-- Permanente → event_day_id NULL,    covers_all_days = true
-- Lote comum de outro evento → os dois em branco (comportamento de hoje)

ALTER TABLE public.event_lots
  ADD COLUMN IF NOT EXISTS event_day_id    uuid    NULL REFERENCES public.event_days(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS covers_all_days boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_event_lots_day ON public.event_lots(event_day_id);

-- Um lote não pode ser "de um dia" e "de todos os dias" ao mesmo tempo.
-- Sem isso, a trava de 1 CPF/dia teria que adivinhar qual das duas vale.
ALTER TABLE public.event_lots DROP CONSTRAINT IF EXISTS event_lots_dia_coerente;
ALTER TABLE public.event_lots ADD CONSTRAINT event_lots_dia_coerente
  CHECK (NOT (covers_all_days AND event_day_id IS NOT NULL));


-- ----------------------------------------------------------------------------
-- 3. event_lots — modo da taxa e teto de parcelas
-- ----------------------------------------------------------------------------
-- modo_taxa:
--   'cliente_paga' (DEFAULT, = hoje) → taxa somada POR CIMA do face.
--                                      Cliente paga face + taxa; produtor recebe face integral.
--   'absorve'                        → cliente paga o face REDONDO.
--                                      Os 10% e o custo do crédito saem do repasse (§6).
--
-- max_parcelas:
--   NULL (DEFAULT, = hoje) → sem limite; hoje o checkout aceita 1..12.
--   N                      → o servidor RECUSA acima de N. Promo=3, 1º lote=2, avulsos=1.

ALTER TABLE public.event_lots
  ADD COLUMN IF NOT EXISTS modo_taxa    text     NOT NULL DEFAULT 'cliente_paga',
  ADD COLUMN IF NOT EXISTS max_parcelas smallint NULL;

ALTER TABLE public.event_lots DROP CONSTRAINT IF EXISTS event_lots_modo_taxa_valido;
ALTER TABLE public.event_lots ADD CONSTRAINT event_lots_modo_taxa_valido
  CHECK (modo_taxa IN ('absorve', 'cliente_paga'));

-- 1..12: acima de 12 nenhuma adquirente do fluxo aceita; 0 ou negativo é bug.
ALTER TABLE public.event_lots DROP CONSTRAINT IF EXISTS event_lots_max_parcelas_valido;
ALTER TABLE public.event_lots ADD CONSTRAINT event_lots_max_parcelas_valido
  CHECK (max_parcelas IS NULL OR (max_parcelas >= 1 AND max_parcelas <= 12));


-- ----------------------------------------------------------------------------
-- 4. Conferência (rodar DEPOIS, uma consulta por vez)
-- ----------------------------------------------------------------------------
-- Nada mudou nos lotes existentes? Todos devem sair 'cliente_paga' / NULL / false:
--
--   SELECT modo_taxa, max_parcelas, covers_all_days, count(*)
--     FROM public.event_lots
--    GROUP BY 1,2,3;
--
-- A tabela nova nasceu vazia?
--
--   SELECT count(*) FROM public.event_days;


-- ----------------------------------------------------------------------------
-- ROLLBACK (só se precisar desfazer — nada aqui é usado por código ainda)
-- ----------------------------------------------------------------------------
-- ALTER TABLE public.event_lots
--   DROP CONSTRAINT IF EXISTS event_lots_max_parcelas_valido,
--   DROP CONSTRAINT IF EXISTS event_lots_modo_taxa_valido,
--   DROP CONSTRAINT IF EXISTS event_lots_dia_coerente,
--   DROP COLUMN IF EXISTS max_parcelas,
--   DROP COLUMN IF EXISTS modo_taxa,
--   DROP COLUMN IF EXISTS covers_all_days,
--   DROP COLUMN IF EXISTS event_day_id;
-- DROP TABLE IF EXISTS public.event_days;
