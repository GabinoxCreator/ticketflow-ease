-- OS-426 (12/11/2026): lote "sem taxa" tira SÓ a taxa de conveniência.
--
-- Regra do Gabriel: são três cobranças diferentes. A taxa de conveniência pode
-- ser absorvida pelo produtor; o custo do cartão e o juro de parcela são sempre
-- do comprador. Quando o produtor absorve a conveniência, ele recebe a face
-- MENOS a taxa (ex.: R$ 389 com 12% = R$ 342,32).
--
-- Até aqui o repasse (`order_producer_value`) pagava a face cheia em lote
-- 'absorve': a taxa saía de dentro do preço e ninguém a descontava.
--
-- 1) `order_line_face.taxa_absorvida_pct`: o percentual absorvido, gravado no
--    ato da venda pelas edges `marcel-*` (só em linha de lote 'absorve').
--    Congelado para uma mudança de taxa depois não mexer no repasse de quem já
--    comprou. ⚠️ `modo_taxa` da mesma tabela NÃO serve para isso: ele diz quem
--    pagou o custo do CARTÃO naquela venda (faixa sem juros do Rodeo).
-- 2) `order_producer_value`: desconta a taxa absorvida. Linha gravada antes
--    desta migration (sem o percentual) e marcada 'absorve' usa a taxa do
--    evento para o meio do pedido (`event_fee_overrides`), senão os 10% padrão
--    (`DEFAULT_FEE_PERCENT` das edges).
-- 3) Reembolso (decisão do Gabriel, 12/11: "389 volta, taxa sai junto"): o
--    comprador recebe a face (`reembolso_valores` não muda, ele lê o bruto) e
--    o ingresso devolvido conta zero para o produtor E para a casa. Por isso a
--    taxa absorvida é descontada só na parte NÃO reembolsada do pedido.
--
-- 4) Cupom (decisão do Gabriel, 12/11: "Da face cheia"): os 12% saem da FACE,
--    antes do cupom, como a taxa de quem paga por cima. Cupom é desconto do
--    produtor: R$ 389 com 10% → comprador paga 350,10, produtor 303,42.
--
-- `order_producer_value_bruto` não muda de propósito: é ele que diz quanto o
-- comprador recebe de volta (`reembolso_valores`).
-- Quem lê `order_producer_value` (e passa a enxergar o desconto sem mudar
-- nada): base_de_repasse → request_payout, resumo_repasse_do_evento,
-- gestao_repasse_extrato, gestao_repasse_pedidos, producer_order_values.
--
-- Sem pedido 'absorve' pago até 12/11 17h (só 1 de demonstração, R$ 1): nenhum
-- repasse já pago muda de valor.

alter table public.order_line_face
  add column if not exists taxa_absorvida_pct numeric(5,2)
    check (taxa_absorvida_pct is null or (taxa_absorvida_pct >= 0 and taxa_absorvida_pct <= 100));

comment on column public.order_line_face.taxa_absorvida_pct is
  'OS-426: percentual da taxa de conveniência que o produtor absorveu nesta linha (lote absorve), gravado no ato. null = o comprador pagou a taxa por cima. O repasse desconta face × este percentual.';

create or replace function public.order_producer_value(o orders)
 returns numeric
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with taxa_do_evento as (
    -- Só para linha antiga sem percentual gravado (vendas antes da OS-426).
    select coalesce(
             (select x.fee_percent
                from public.event_fee_overrides x
               where x.event_id = o.event_id
                 and x.payment_method = case
                       when lower(coalesce(o.payment_method, '')) like '%pix%' then 'pix'
                       else 'card' end),
             10) as pct
  ),
  v as (
    select public.order_producer_value_bruto(o) as bruto,
           coalesce((select sum(r.valor_ingressos)
                       from public.reembolsos r
                      where r.order_id = o.id
                        and r.status in ('solicitado', 'aprovado', 'pago')), 0) as reembolsado,
           coalesce((select round(sum(
                               f.unit_face * f.quantity
                               * coalesce(f.taxa_absorvida_pct,
                                          case when f.modo_taxa = 'absorve' then t.pct end,
                                          0)
                               / 100.0), 2)
                       from public.order_line_face f, taxa_do_evento t
                      where f.order_id = o.id), 0) as absorvida
  )
  select case
           when v.absorvida > 0 and v.bruto > 0 then
             (v.bruto - v.reembolsado)
             - round(v.absorvida * greatest(v.bruto - v.reembolsado, 0) / v.bruto, 2)
           else v.bruto - v.reembolsado
         end
    from v;
$function$;
