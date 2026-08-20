-- ============================================================================
-- event_seats: FASE B (fechar para quem está logado) + EXECUTE das funções
-- Data: 20/08/2026 — execução da OS-04
--
-- POR QUE
--   A migration 20260812190000 fez a FASE A (RPC get_event_tables_management,
--   escopada ao produtor dono) e deixou a FASE B **comentada**, para ser
--   aplicada só depois do front novo publicado. O front já está publicado e a
--   fase B já foi aplicada à mão no banco — mas nunca voltou para o repositório.
--   Este arquivo acaba com essa mentira: o que está no banco passa a estar
--   escrito aqui. Sem isto, um `grant select on event_seats to authenticated`
--   distraído (ou um banco recriado a partir das migrations) reabre o vazamento
--   em silêncio, e ninguém percebe porque o repositório nunca disse o contrário.
--
-- O QUE ESTE ARQUIVO GARANTE
--   1. `authenticated` enxerga de event_seats **apenas o desenho do mapa**.
--      Somem: hold_token, held_by_user_id, order_id, sold_order_id,
--      pending_order_id, manual_holder_name/phone/notes, manually_closed_*,
--      wristbands_* (nome de quem retirou a pulseira) e os timestamps.
--   2. As funções da família event_seats deixam de ser executáveis por `public`
--      e `anon`. O portão interno (dono do evento ou admin) sempre segurou —
--      provado — mas o `revoke` que a migration de 12/08 tinha posto sumiu no
--      DROP+CREATE de 17/08 (a assinatura mudou para trazer x/y), porque DROP
--      leva os grants junto e o CREATE devolve EXECUTE ao `public` por padrão.
--      Duas trancas na mesma porta, e a de fora tinha caído.
--
-- QUEM CONTINUA VENDO A PII
--   O produtor dono do evento e o admin, pela RPC get_event_tables_management
--   (e pela get_camarote_wristbands, na aba de pulseiras). Nada muda para eles.
--
-- NÃO MEXE EM `anon`
--   O grant de `anon` (fechado em 19/08) tem hoje quatro colunas a mais do que
--   a migration de 05/07 mandou — created_at, updated_at, seat_type_id e
--   venue_seat_id. Não é PII e o mapa público de 18 clientes depende desse
--   grant: mexer nele é risco sem ganho, e fica registrado aqui de propósito.
--
-- IDEMPOTENTE: pode rodar de novo sem efeito colateral.
-- ============================================================================

begin;

-- ===== 1. Colunas: authenticated só enxerga o desenho do mapa =====
revoke select on table public.event_seats from authenticated;

grant select (id, event_id, status, hold_expires_at, code, label,
              x, y, width, height, radius, rotation, shape, color, icon,
              seat_type_name, base_price, extra_price, base_capacity, max_capacity)
  on public.event_seats to authenticated;

-- ===== 2. EXECUTE: fora do alcance de anônimo =====
-- Leitura de gestão (devolve PII do comprador — o portão de dono/admin segura,
-- mas anônimo não tem por que nem bater na porta).
revoke all on function public.get_event_tables_management(uuid) from public, anon;
grant execute on function public.get_event_tables_management(uuid) to authenticated;

-- Escrita da família event_seats: todas são de produtor logado.
revoke all on function public.prepare_event_seats(uuid) from public, anon;
grant execute on function public.prepare_event_seats(uuid) to authenticated;

revoke all on function public.publish_event_with_snapshot(uuid) from public, anon;
grant execute on function public.publish_event_with_snapshot(uuid) to authenticated;

revoke all on function public.unpublish_event(uuid) from public, anon;
grant execute on function public.unpublish_event(uuid) to authenticated;

revoke all on function public.set_event_seat_terms(uuid, integer, numeric, numeric) from public, anon;
grant execute on function public.set_event_seat_terms(uuid, integer, numeric, numeric) to authenticated;

commit;

-- ============================================================================
-- VERIFICAÇÕES (rodadas em 20/08/2026, produção nsrromaqysgoxqvqagdm)
--
-- Como conta comum logada, via REST com a chave pública:
--   select=*                                            → 42501
--   select=manual_holder_name,manual_holder_phone,...   → 42501
--   select=hold_token,held_by_user_id                   → 42501
--   select=order_id,sold_order_id                       → 42501
--   select=wristbands_delivered_to                      → 42501
--   select=<colunas do desenho>                         → 200, mapa completo
--   rpc get_event_tables_management                     → []  (não é dono)
--   rpc get_camarote_wristbands                         → []  (não é dono)
--
-- Como anônimo:
--   rpc get_event_tables_management                     → 42501 (depois desta)
--   select=<colunas do desenho>                         → 200, mapa completo
--
-- Realtime (não obedece grant de coluna — publica a linha inteira):
--   select attnames from pg_publication_tables where tablename='event_seats'
--   → só as colunas do desenho. Conferido.
-- ============================================================================
