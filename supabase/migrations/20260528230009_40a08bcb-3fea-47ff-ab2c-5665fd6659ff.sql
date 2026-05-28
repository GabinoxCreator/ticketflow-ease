-- Backfill: reattribute the 2 orphan seat types to the real producer (Estação Sambar).
UPDATE public.seat_types
   SET producer_id = '25733b22-05e0-4862-8ec8-7208df6725ac',
       updated_at  = now()
 WHERE producer_id = '95628c4a-8040-44ed-83c5-d6a5b8793926'
   AND id IN ('36d17a7a-5900-4638-89ae-de9e511de010',
              '8fa12b04-72ff-45be-8162-f5c8db99656b');

-- Drop public read policy: all client reads of seat_types are authenticated (producer-only).
-- Public buyer flows read denormalized data from event_seats snapshot, not seat_types.
DROP POLICY IF EXISTS "seat_types_public_select_active" ON public.seat_types;

-- Revoke anon grant since no policy allows anon reads.
REVOKE SELECT ON public.seat_types FROM anon;