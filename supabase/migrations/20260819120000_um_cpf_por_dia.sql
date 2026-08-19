-- 1 CPF = 1 ingresso por DIA (§3 do framework do Rodeio de Novo Horizonte).
--
-- POR QUE EXISTE: é a trava anti-cambista. Sem ela, uma pessoa compra 40
-- ingressos da noite de sábado e revende na porta pelo dobro. A regra é do
-- Gabriel e vale por DIA, não por evento: o mesmo CPF pode ir nas cinco noites,
-- mas não pode ter dois ingressos da MESMA noite.
--
-- ⚠️ REGRA MESTRA DO EVENTO (§0-A): isto não pode mudar o comportamento dos
-- outros 18 clientes do site. A trava só existe onde HÁ DADO que a ligue —
-- lotes com `event_day_id` (avulso de um dia) ou `covers_all_days` (permanente).
-- Evento sem dias cadastrados passa por aqui e sai sem nenhuma restrição, que é
-- exatamente o comportamento de hoje.
--
-- O PERMANENTE OCUPA AS CINCO NOITES. Quem tem passe permanente não compra
-- avulso de noite nenhuma (já tem direito a todas), e quem já tem avulso de uma
-- noite não compra o permanente (ficaria com dois ingressos daquela noite).
--
-- O QUE CONTA COMO OCUPADO: ingresso de pedido pago, ou de pedido pendente que
-- ainda não venceu. Pedido expirado, cancelado ou recusado NÃO conta — senão
-- uma tentativa que falhou bloquearia a pessoa de comprar de novo.
--
-- CAMAROTE NÃO ENTRA: mesa é vendida em bloco e não é nominal (§9 do
-- framework), então não tem CPF por assento para travar.

CREATE OR REPLACE FUNCTION public.dias_ocupados_por_cpf(
  _event_id uuid,
  _cpf      text
)
RETURNS TABLE (event_day_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH cpf_norm AS (
    SELECT NULLIF(regexp_replace(COALESCE(_cpf, ''), '\D', '', 'g'), '') AS cpf
  ),
  -- Ingressos que a pessoa já tem de pé neste evento.
  meus AS (
    SELECT t.lot_id
      FROM public.tickets t
      JOIN public.orders o ON o.id = t.order_id
      CROSS JOIN cpf_norm c
     WHERE o.event_id = _event_id
       AND c.cpf IS NOT NULL
       AND regexp_replace(COALESCE(o.customer_cpf, ''), '\D', '', 'g') = c.cpf
       AND t.status <> 'cancelled'
       AND (
             o.status = 'paid'
          OR (o.status = 'pending' AND o.expires_at IS NOT NULL AND o.expires_at > now())
       )
  ),
  -- Tem passe permanente? Então ocupa todas as noites do evento.
  tem_permanente AS (
    SELECT EXISTS (
      SELECT 1 FROM meus m
        JOIN public.event_lots l ON l.id = m.lot_id
       WHERE l.covers_all_days IS TRUE
    ) AS sim
  )
  SELECT d.id
    FROM public.event_days d, tem_permanente p
   WHERE d.event_id = _event_id AND p.sim
  UNION
  SELECT l.event_day_id
    FROM meus m
    JOIN public.event_lots l ON l.id = m.lot_id
   WHERE l.event_day_id IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.dias_ocupados_por_cpf(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dias_ocupados_por_cpf(uuid, text) FROM anon, authenticated;


-- Dado o que a pessoa QUER comprar, devolve as noites em conflito.
-- Vazio = pode comprar.
--
-- Pega os três jeitos de furar a regra:
--   1. comprar 2 ingressos do mesmo lote de uma noite (quantidade > 1);
--   2. comprar 2 lotes diferentes da mesma noite (1º e 2º lote de sábado);
--   3. comprar uma noite que a pessoa já tem — inclusive via permanente.
CREATE OR REPLACE FUNCTION public.conflitos_cpf_por_dia(
  _event_id uuid,
  _cpf      text,
  _itens    jsonb   -- [{"lot_id": "...", "quantity": 2}, ...]
)
RETURNS TABLE (event_day_id uuid, dia_label text, motivo text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tem_dia boolean;
BEGIN
  -- Evento sem noites cadastradas = evento comum: nenhuma trava, como hoje.
  SELECT EXISTS (SELECT 1 FROM public.event_days WHERE event_id = _event_id) INTO _tem_dia;
  IF NOT _tem_dia THEN RETURN; END IF;

  RETURN QUERY
  WITH pedido AS (
    SELECT (i->>'lot_id')::uuid AS lot_id,
           GREATEST(1, COALESCE((i->>'quantity')::int, 1)) AS qtd
      FROM jsonb_array_elements(COALESCE(_itens, '[]'::jsonb)) i
  ),
  -- Cada linha do carrinho vira as noites que ela cobre.
  pedido_dias AS (
    SELECT d.id AS dia, p.qtd
      FROM pedido p
      JOIN public.event_lots l ON l.id = p.lot_id
      JOIN public.event_days d ON d.event_id = _event_id
     WHERE l.covers_all_days IS TRUE
    UNION ALL
    SELECT l.event_day_id AS dia, p.qtd
      FROM pedido p
      JOIN public.event_lots l ON l.id = p.lot_id
     WHERE l.event_day_id IS NOT NULL
  ),
  -- Quantos ingressos deste pedido caem em cada noite.
  por_dia AS (
    SELECT dia, SUM(qtd)::int AS qtd FROM pedido_dias GROUP BY dia
  ),
  ja_tenho AS (
    SELECT o.event_day_id AS dia FROM public.dias_ocupados_por_cpf(_event_id, _cpf) o
  )
  SELECT pd.dia,
         d.label,
         CASE
           WHEN EXISTS (SELECT 1 FROM ja_tenho j WHERE j.dia = pd.dia)
             THEN 'ja_possui'
           ELSE 'quantidade_no_pedido'
         END
    FROM por_dia pd
    JOIN public.event_days d ON d.id = pd.dia
   WHERE pd.qtd > 1
      OR EXISTS (SELECT 1 FROM ja_tenho j WHERE j.dia = pd.dia);
END;
$function$;

REVOKE ALL ON FUNCTION public.conflitos_cpf_por_dia(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conflitos_cpf_por_dia(uuid, text, jsonb) FROM anon, authenticated;
