-- ============================================================================
-- get_event_tables_management passa a devolver a POSIÇÃO de cada unidade
-- Data: 17/08/2026
--
-- POR QUE
--   A aba de gestão de mesas/camarotes lia esta RPC, que não trazia x/y — por
--   isso a "visão de mapa" era uma grade de cards, não uma planta. Com 100
--   camarotes no Rodeio de Novo Horizonte isso deixou de servir: o produtor
--   precisa bater o olho e ver a ocupação, não rolar uma lista de 100 itens.
--
-- O QUE MUDA
--   Seis colunas novas NO FIM do retorno: x, y, width, height, radius, rotation.
--   Nada foi removido nem reordenado, e a consulta é a mesma — quem já consome
--   por nome continua funcionando igual.
--
-- POR QUE PRECISA DE DROP
--   Mudar a assinatura de RETURNS TABLE não é possível com CREATE OR REPLACE.
--   O DROP e o CREATE vão no MESMO arquivo/transação de propósito: rodados
--   juntos, não existe instante em que a função não exista para o painel.
--
-- SEGURANÇA
--   Mantidos `SECURITY DEFINER`, o `search_path` fixo e o gate de dono/admin.
--   O GRANT é reaplicado porque o DROP leva os grants junto — sem esta linha a
--   aba passaria a receber "permission denied".
-- ============================================================================

drop function if exists public.get_event_tables_management(uuid);

create or replace function public.get_event_tables_management(_event_id uuid)
 returns table(
   id uuid, event_id uuid, code text, label text, status text, color text, shape text,
   seat_type_name text, base_capacity integer, max_capacity integer,
   base_price numeric, extra_price numeric,
   sold_order_id uuid, order_id uuid, hold_expires_at timestamp with time zone,
   manually_closed_at timestamp with time zone, manual_close_reason text,
   manual_holder_name text, manual_holder_phone text, manual_holder_notes text,
   customer_name text, customer_email text, customer_phone text,
   order_total numeric, order_paid_at timestamp with time zone, seats_sold integer,
   x integer, y integer, width integer, height integer, radius integer, rotation integer
 )
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select s.id, s.event_id, s.code, s.label, s.status, s.color, s.shape,
         s.seat_type_name, s.base_capacity, s.max_capacity, s.base_price, s.extra_price,
         s.sold_order_id, s.order_id, s.hold_expires_at,
         s.manually_closed_at, s.manual_close_reason,
         s.manual_holder_name, s.manual_holder_phone, s.manual_holder_notes,
         o.customer_name, o.customer_email, o.customer_phone,
         o.total_amount,
         case when o.status = 'paid' then o.updated_at end,
         case when coalesce(s.sold_order_id, s.order_id) is null then null
              else coalesce(tk.n, 0) end,
         s.x, s.y, s.width, s.height, s.radius, s.rotation
  from public.event_seats s
  left join public.orders o on o.id = coalesce(s.sold_order_id, s.order_id)
  left join lateral (
    select count(*)::integer as n
    from public.tickets t
    where t.order_id = coalesce(s.sold_order_id, s.order_id)
      and t.status in ('valid', 'used')
  ) tk on coalesce(s.sold_order_id, s.order_id) is not null
  where s.event_id = _event_id
    and exists (
      select 1 from public.events e
      where e.id = _event_id
        and (e.producer_id = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role))
    );
$function$;

grant execute on function public.get_event_tables_management(uuid) to authenticated;
