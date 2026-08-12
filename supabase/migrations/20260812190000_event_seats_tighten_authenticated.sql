-- Hardening #4 (12/08/2026): PII de terceiro (manual_holder_*) e ids de pedido
-- de event_seats fora do alcance de QUALQUER usuário logado. A leitura de
-- gestão da aba de mesas passa para RPC escopada ao produtor dono (ou admin) —
-- o follow-up prometido na migration 20260705180000.
-- ⚠️ Aplicar no SQL Editor (commitar ≠ aplicar) em DUAS FASES:
--   FASE A (aditiva) → publish do front que usa a RPC → validar aba de mesas →
--   FASE B (revoga as colunas). Ordem inversa QUEBRA a aba de mesas em produção.

-- ===== FASE A: RPC de gestão escopada ao dono do evento =====
-- Substitui as 3 queries do useEventTables (seats + orders + tickets) por uma
-- chamada só. Quem não for dono/admin recebe zero linhas — sem vazar existência.
create or replace function public.get_event_tables_management(_event_id uuid)
returns table (
  id uuid,
  event_id uuid,
  code text,
  label text,
  status text,
  color text,
  shape text,
  seat_type_name text,
  base_capacity integer,
  max_capacity integer,
  base_price numeric,
  extra_price numeric,
  sold_order_id uuid,
  order_id uuid,
  hold_expires_at timestamptz,
  manually_closed_at timestamptz,
  manual_close_reason text,
  manual_holder_name text,
  manual_holder_phone text,
  manual_holder_notes text,
  customer_name text,
  customer_email text,
  customer_phone text,
  order_total numeric,
  order_paid_at timestamptz,
  seats_sold integer
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.event_id, s.code, s.label, s.status, s.color, s.shape,
         s.seat_type_name, s.base_capacity, s.max_capacity, s.base_price, s.extra_price,
         s.sold_order_id, s.order_id, s.hold_expires_at,
         s.manually_closed_at, s.manual_close_reason,
         s.manual_holder_name, s.manual_holder_phone, s.manual_holder_notes,
         o.customer_name, o.customer_email, o.customer_phone,
         o.total_amount,
         case when o.status = 'paid' then o.updated_at end,
         -- mesmo critério do hook antigo (sold_order_id ?? order_id; null sem pedido)
         case when coalesce(s.sold_order_id, s.order_id) is null then null
              else coalesce(tk.n, 0) end
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
$$;

revoke all on function public.get_event_tables_management(uuid) from public, anon;
grant execute on function public.get_event_tables_management(uuid) to authenticated;

-- ===== FASE B: aplicar SÓ depois do front novo publicado e validado =====
-- authenticated fica igual ao anon: apenas as colunas de desenho do mapa.
-- Somem: order_id, sold_order_id, manually_closed_at, manual_close_reason,
-- manual_holder_name, manual_holder_phone, manual_holder_notes.
-- begin;
-- revoke select on table public.event_seats from authenticated;
-- grant select (id, event_id, status, hold_expires_at, code, label,
--               x, y, width, height, radius, rotation, shape, color, icon,
--               seat_type_name, base_price, extra_price, base_capacity, max_capacity)
--   on public.event_seats to authenticated;
-- commit;

-- VERIFICAÇÃO (depois da fase B, como usuário logado comum via REST):
-- select manual_holder_name from event_seats limit 0  →  permission denied (42501)
