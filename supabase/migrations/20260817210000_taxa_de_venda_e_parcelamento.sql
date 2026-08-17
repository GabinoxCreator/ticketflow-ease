-- ============================================================================
-- Custo do crédito na VENDA + opções de parcelamento
-- Data: 17/08/2026
--
-- CONTEXTO
--   A FestPag passa a operar os pagamentos pela API do Marcel (decisão do
--   Gabriel, 17/08). Nessa API o crédito vai **até 10x** e ela não cobra juro do
--   comprador — o custo é o MDR combinado. Decisão: **em venda parcelada, o
--   custo é do comprador**; nos dois lotes promocionais do rodeio, sai do
--   repasse do produtor.
--
--   A tabela `credit_rates` já existia, mas só com os modos de REPASSE (quanto o
--   produtor recebe, do PDF de 14/08). Custo de venda é outra coisa e precisa de
--   modo próprio — daí `mode = 'venda'`.
--
-- POR QUE UMA LINHA SÓ POR PARCELA, E NÃO POR BANDEIRA
--   A tabela do adquirente tem três faixas (Visa/Master · Elo/Diners/Discover ·
--   Amex/Hipercard/JCB). Decisão do Gabriel: **usar sempre a MAIOR taxa da
--   parcela**. Assim nenhuma venda sai abaixo do custo, seja qual for o cartão —
--   e o preço na tela não muda depois que o cliente digita o número (a bandeira
--   só se conhece no fim). Por isso `brand_group = '*'`.
--
-- POR QUE ARITMÉTICA INTEIRA NA FUNÇÃO
--   O gross-up é `face / (1 - taxa)`, com arredondamento PARA CIMA. Misturar
--   `numeric` no meio arredonda na conversão e aplica o teto duas vezes, dando
--   1 centavo a mais — o erro que apareceu em 18 de 20 casos no motor de
--   repasse mais cedo hoje. Tudo em `bigint`: a divisão trunca e a conta fecha.
--
-- PROVADO EM PRODUÇÃO (17/08, ingresso de R$300, 10 faixas):
--   o que sobra ao produtor depois da taxa é **exatamente R$300,00** em todas.
-- ============================================================================

-- 1. O modo novo. ADIÇÃO: os dois modos de repasse seguem válidos.
alter table public.credit_rate_versions drop constraint if exists credit_rate_versions_mode_check;
alter table public.credit_rate_versions add constraint credit_rate_versions_mode_check
  check (mode = any (array['padrao'::text, 'antecipado'::text, 'venda'::text]));

-- 2. A tabela de custo. Guardada para não duplicar se a migration rodar de novo.
do $$
declare _version uuid;
begin
  if exists (select 1 from public.credit_rate_versions
              where mode = 'venda' and adquirente = 'marcel' and vigente_desde = date '2026-08-17') then
    return;
  end if;

  insert into public.credit_rate_versions (mode, adquirente, vigente_desde, notas)
  values ('venda', 'marcel', '2026-08-17',
    'Custo da venda no credito (MDR por faixa de parcela). Decisao do Gabriel 17/08/2026: usar sempre a MAIOR taxa da parcela entre as bandeiras, por isso brand_group=* -- assim nenhuma venda sai abaixo do custo, seja qual for o cartao. Teto de 10x porque a API do Marcel nao aceita mais. Debito (2,84%) fora: a API nao expoe debito.')
  returning id into _version;

  insert into public.credit_rates (version_id, brand_group, installments, rate_ppm)
  select _version, '*', v.parcelas, v.ppm
  from (values
    (1::smallint,  46900),  -- 4,69%  (maior entre Visa/Master 4,44 e Elo/Amex 4,69)
    (2::smallint,  68100),  -- 6,81%
    (3::smallint,  77800),  -- 7,78%
    (4::smallint,  87600),  -- 8,76%
    (5::smallint,  97200),  -- 9,72%
    (6::smallint, 106900),  -- 10,69%
    (7::smallint, 116600),  -- 11,66%
    (8::smallint, 126400),  -- 12,64%
    (9::smallint, 136100),  -- 13,61%
    (10::smallint,145700)   -- 14,57%
  ) as v(parcelas, ppm);
end $$;

-- 3. As opções que a tela pode oferecer, já com o custo resolvido.
CREATE OR REPLACE FUNCTION public.opcoes_parcelamento(
  _face_cents bigint,
  _absorve boolean DEFAULT false,
  _max_parcelas smallint DEFAULT 10
)
 RETURNS TABLE(parcelas smallint, total_cents bigint, parcela_cents bigint, taxa_pct numeric, acrescimo_cents bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _version uuid;
  _min_parcela_cents bigint := 500;  -- R$5,00: exigência da API do Marcel
BEGIN
  -- `_absorve = true` é a exceção do rodeio (promocional e 1º lote): o comprador
  -- paga a face redonda em qualquer parcela e o custo sai do repasse. A regra é
  -- uma só; o que muda é quem paga.
  SELECT id INTO _version
    FROM credit_rate_versions
   WHERE mode = 'venda' AND adquirente = 'marcel' AND vigente_desde <= current_date
   ORDER BY vigente_desde DESC
   LIMIT 1;

  IF _version IS NULL THEN
    RAISE EXCEPTION 'sem_tabela_de_taxa' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    r.installments,
    t.total,
    (t.total / r.installments)::bigint,   -- centavos da divisão sobram na 1ª, como a API faz
    (r.rate_ppm / 10000.0)::numeric(6,2),
    (t.total - _face_cents)::bigint
  FROM credit_rates r
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN _absorve THEN _face_cents
      ELSE
        -- Gross-up "por dentro": o comprador paga o valor que, DEPOIS da taxa,
        -- deixa a face cheia. NÃO é face × (1+taxa) — essa conta deixa o
        -- produtor a menos. Tudo em bigint (ver cabeçalho).
        ((_face_cents * 1000000 + (1000000 - r.rate_ppm) - 1)
          / (1000000 - r.rate_ppm))::bigint
    END AS total
  ) t
  WHERE r.version_id = _version
    AND r.installments <= _max_parcelas
    -- Parcela abaixo de R$5 faz a API recusar a venda INTEIRA, não cair para
    -- menos vezes. Melhor nem oferecer.
    AND (t.total / r.installments) >= _min_parcela_cents
  ORDER BY r.installments;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.opcoes_parcelamento(bigint, boolean, smallint) TO authenticated, anon;
