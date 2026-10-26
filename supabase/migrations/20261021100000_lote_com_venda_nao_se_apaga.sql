-- OS-297 (21/10/2026) · Lote que já vendeu não se apaga (e não leva os ingressos junto).
-- Nasceu da 2ª rodada do revisor da OS-266 (Doca 290).
--
-- As chaves tickets.lot_id e door_sales.lot_id -> event_lots são ON DELETE CASCADE,
-- e order_line_face.lot_id (o valor de face que o repasse usa) é ON DELETE SET NULL.
-- Apagar um lote levava junto os ingressos e as vendas na porta dele, pagos ou não,
-- e deixava a linha de face do pedido sem lote. A regra "Produtores podem deletar
-- lotes" só confere se o evento é do produtor, e a lixeira do painel apagava sem
-- perguntar: um clique deixava pedido pago sem ingresso. Fere "pedido nunca é
-- apagado" (lição de 23/05).
--
-- A trava é um gatilho, e não a regra de acesso, pelo mesmo motivo da OS-266
-- (_evento_com_pedido_nao_se_apaga): vale para todo mundo, o produtor e a casa
-- (admin), e uma regra de acesso só esconderia a linha, e o painel diria "Lote
-- excluído" sem ter excluído. Qualquer ingresso conta (válido, usado, pendente ou
-- cancelado): ingresso cancelado ou pendente é rastro de pedido, e o pedido não se
-- apaga. Lote sem nenhuma venda (criado por engano) continua se apagando.
-- Para parar de vender, desativa-se o lote (UPDATE em is_active), como já existe.
-- A frase fala em "pedidos", não em "ingressos vendidos": lote travado só por
-- ingresso cancelado ou pendente, ou por pedido vencido, aparece no painel com
-- "0 vendidos" (decisão do Gabriel, 21/10, na revisão desta ordem).
--
-- Com a OS-266 no ar, apagar um evento com venda é recusado antes, no próprio
-- evento, e a cascata nem chega aos lotes. As duas sobem em qualquer ordem.

create or replace function public._lote_com_venda_nao_se_apaga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.tickets where lot_id = old.id)
     or exists (select 1 from public.door_sales where lot_id = old.id)
     or exists (select 1 from public.order_line_face where lot_id = old.id) then
    raise exception 'Este lote já tem pedidos e não pode ser excluído. Para parar de vender, desative o lote.'
      using errcode = 'P0001', hint = 'lote_com_vendas';
  end if;
  return old;
end;
$$;

revoke all on function public._lote_com_venda_nao_se_apaga() from public, anon, authenticated;

drop trigger if exists trg_lote_com_venda_nao_se_apaga on public.event_lots;
create trigger trg_lote_com_venda_nao_se_apaga
  before delete on public.event_lots
  for each row execute function public._lote_com_venda_nao_se_apaga();

-- VOLTAR ATRÁS (só se precisar; devolve exatamente o que estava no ar em 21/10,
-- quando event_lots não tinha gatilho nenhum):
-- drop trigger if exists trg_lote_com_venda_nao_se_apaga on public.event_lots;
-- drop function if exists public._lote_com_venda_nao_se_apaga();
