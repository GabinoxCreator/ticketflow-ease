-- ============================================================
-- FASE 7 — Motor de hold/release/confirm de event_seats
-- ============================================================

-- 1) Apertar SELECT público: só eventos publicados
DROP POLICY IF EXISTS event_seats_public_select ON public.event_seats;

CREATE POLICY event_seats_public_select
ON public.event_seats
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = event_seats.event_id
       AND e.status = 'published'
  )
);

-- ============================================================
-- 2) RPC hold_seats — all-or-nothing, atômico, authenticated
-- ============================================================
CREATE OR REPLACE FUNCTION public.hold_seats(
  _event_id uuid,
  _seat_ids uuid[],
  _window   interval DEFAULT interval '10 minutes'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid         uuid := auth.uid();
  _token       text := gen_random_uuid()::text;
  _expires_at  timestamptz := now() + _window;
  _updated     int;
  _requested   int;
  _event_ok    boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF _seat_ids IS NULL OR array_length(_seat_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_seats_requested' USING ERRCODE = '22023';
  END IF;

  _requested := array_length(_seat_ids, 1);

  SELECT EXISTS (
    SELECT 1 FROM public.events
     WHERE id = _event_id AND status = 'published'
  ) INTO _event_ok;

  IF NOT _event_ok THEN
    RAISE EXCEPTION 'event_not_available' USING ERRCODE = 'P0001';
  END IF;

  WITH upd AS (
    UPDATE public.event_seats
       SET status            = 'held',
           held_by_user_id   = _uid,
           hold_token        = _token,
           hold_expires_at   = _expires_at,
           updated_at        = now()
     WHERE event_id = _event_id
       AND id = ANY(_seat_ids)
       AND (
            status = 'available'
         OR (status = 'held' AND hold_expires_at < now())
       )
    RETURNING id
  )
  SELECT count(*) INTO _updated FROM upd;

  IF _updated <> _requested THEN
    RAISE EXCEPTION 'seats_unavailable' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'hold_token',  _token,
    'expires_at',  _expires_at,
    'seats',       to_jsonb(_seat_ids)
  );
END;
$$;

-- ============================================================
-- 3) RPC release_seats — abandono de checkout, authenticated
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_seats(
  _event_id   uuid,
  _hold_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid     uuid := auth.uid();
  _released int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF _hold_token IS NULL OR length(_hold_token) = 0 THEN
    RAISE EXCEPTION 'missing_token' USING ERRCODE = '22023';
  END IF;

  WITH upd AS (
    UPDATE public.event_seats
       SET status          = 'available',
           held_by_user_id = NULL,
           hold_token      = NULL,
           hold_expires_at = NULL,
           updated_at      = now()
     WHERE event_id        = _event_id
       AND hold_token      = _hold_token
       AND status          = 'held'
       AND held_by_user_id = _uid
    RETURNING id
  )
  SELECT count(*) INTO _released FROM upd;

  RETURN jsonb_build_object('released', _released);
END;
$$;

-- ============================================================
-- 4) RPC confirm_seats — held → sold, SERVICE ROLE ONLY
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_seats(
  _event_id   uuid,
  _hold_token text,
  _seat_ids   uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _confirmed    uuid[];
  _already_sold uuid[];
  _lost         uuid[];
BEGIN
  IF _hold_token IS NULL OR length(_hold_token) = 0 THEN
    RAISE EXCEPTION 'missing_token' USING ERRCODE = '22023';
  END IF;

  IF _seat_ids IS NULL OR array_length(_seat_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_seats' USING ERRCODE = '22023';
  END IF;

  WITH upd AS (
    UPDATE public.event_seats
       SET status          = 'sold',
           hold_token      = NULL,
           hold_expires_at = NULL,
           updated_at      = now()
     WHERE event_id        = _event_id
       AND id              = ANY(_seat_ids)
       AND status          = 'held'
       AND hold_token      = _hold_token
       AND hold_expires_at >= now()
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO _confirmed FROM upd;

  -- Idempotência frouxa: já vendidos (mesmo sem token) contam como confirmed.
  -- Justificativa: MP reentrega webhook; na 2ª chamada hold_token já é NULL.
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO _already_sold
    FROM public.event_seats
   WHERE event_id = _event_id
     AND id       = ANY(_seat_ids)
     AND status   = 'sold'
     AND id <> ALL(_confirmed);

  _confirmed := _confirmed || _already_sold;

  SELECT COALESCE(array_agg(s), ARRAY[]::uuid[]) INTO _lost
    FROM unnest(_seat_ids) s
   WHERE s <> ALL(_confirmed);

  RETURN jsonb_build_object(
    'confirmed', to_jsonb(_confirmed),
    'lost',      to_jsonb(_lost)
  );
END;
$$;

-- ============================================================
-- 5) Sweeper helper + pg_cron job 1/min
-- ============================================================
CREATE OR REPLACE FUNCTION public.sweep_expired_event_seat_holds()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  WITH upd AS (
    UPDATE public.event_seats
       SET status          = 'available',
           held_by_user_id = NULL,
           hold_token      = NULL,
           hold_expires_at = NULL,
           updated_at      = now()
     WHERE status = 'held'
       AND hold_expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO _n FROM upd;
  RETURN _n;
END;
$$;

-- ============================================================
-- 6) GRANTs / REVOKEs
-- ============================================================
-- hold_seats: authenticated dispara do front
REVOKE ALL ON FUNCTION public.hold_seats(uuid, uuid[], interval) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hold_seats(uuid, uuid[], interval) TO authenticated;

-- release_seats: authenticated dispara do front
REVOKE ALL ON FUNCTION public.release_seats(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_seats(uuid, text) TO authenticated;

-- confirm_seats: SERVICE ROLE ONLY (webhook MP — Fase 10)
REVOKE ALL ON FUNCTION public.confirm_seats(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;

-- sweeper: ninguém chama direto, só o cron (que roda como superuser)
REVOKE ALL ON FUNCTION public.sweep_expired_event_seat_holds() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 7) Cron job 1/min (idempotente)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-expired-event-seat-holds') THEN
    PERFORM cron.unschedule('sweep-expired-event-seat-holds');
  END IF;
  PERFORM cron.schedule(
    'sweep-expired-event-seat-holds',
    '* * * * *',
    $job$SELECT public.sweep_expired_event_seat_holds();$job$
  );
END $$;