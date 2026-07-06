-- LGPD/segurança: colunas sensíveis de event_seats fora do alcance dos clients.
-- hold_token é SEGREDO (permite release/confirm de hold ALHEIO); held_by_user_id
-- é PII; manual_holder_* é PII de terceiro (nome/telefone). A policy pública só
-- restringia LINHAS (evento publicado), nunca COLUNAS. Edges e RPCs SECURITY
-- DEFINER (service_role/definer) NÃO são afetadas por estes grants.
-- ⚠️ Aplicar no SQL Editor (commitar ≠ aplicar) e verificar com as queries do fim.

begin;

revoke select on table public.event_seats from anon, authenticated;

-- ANON (mapa público de compra): só o necessário pra desenhar o mapa.
grant select (id, event_id, status, hold_expires_at, code, label,
              x, y, width, height, radius, rotation, shape, color, icon,
              seat_type_name, base_price, extra_price, base_capacity, max_capacity)
  on public.event_seats to anon;

-- AUTHENTICATED: o de cima + campos de gestão que a aba de mesas do produtor lê
-- (useEventTables). Residual CONHECIDO: qualquer usuário logado ainda enxerga
-- manual_holder_*/order ids — follow-up: mover a leitura do produtor pra RPC
-- escopada por dono e apertar isto aqui também.
grant select (id, event_id, status, hold_expires_at, code, label,
              x, y, width, height, radius, rotation, shape, color, icon,
              seat_type_name, base_price, extra_price, base_capacity, max_capacity,
              order_id, sold_order_id,
              manually_closed_at, manual_close_reason,
              manual_holder_name, manual_holder_phone, manual_holder_notes)
  on public.event_seats to authenticated;

commit;

-- REALTIME: o canal de UPDATE manda a linha INTEIRA (grants de coluna não valem
-- lá) — limitar as colunas publicadas (column list, PG15+). O front só precisa
-- de status/hold_expires_at mudando ao vivo.
alter publication supabase_realtime drop table public.event_seats;
alter publication supabase_realtime add table public.event_seats
  (id, event_id, status, hold_expires_at, code, label,
   x, y, width, height, radius, rotation, shape, color, icon,
   seat_type_name, base_price, extra_price, base_capacity, max_capacity);

-- VERIFICAÇÕES (rodar depois):
-- select puballtables from pg_publication where pubname='supabase_realtime';  -- precisa ser false
-- select * from pg_publication_tables where tablename = 'event_seats';        -- deve listar as colunas acima
