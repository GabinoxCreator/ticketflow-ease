
-- 1. Fechar leitura pública de cupons
DROP POLICY IF EXISTS "Cupons ativos visíveis publicamente" ON public.event_coupons;

-- 2. Janela de check-in
CREATE OR REPLACE FUNCTION public.is_event_checkin_open(_event_id uuid)
RETURNS TABLE (
  is_open boolean,
  reason text,
  starts_at timestamptz,
  ends_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event RECORD;
  _starts timestamptz;
  _ends timestamptz;
BEGIN
  SELECT e.date, e.time INTO _event FROM public.events e WHERE e.id = _event_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'event_not_found'::text, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  _starts := (_event.date::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _ends   := ((_event.date + _event.time)::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '15 hours';

  IF now() < _starts THEN
    RETURN QUERY SELECT false, 'before_window'::text, _starts, _ends;
  ELSIF now() > _ends THEN
    RETURN QUERY SELECT false, 'after_window'::text, _starts, _ends;
  ELSE
    RETURN QUERY SELECT true, NULL::text, _starts, _ends;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_event_checkin_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_checkin_open(uuid) TO service_role;

-- 3. Rate-limit
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  bucket_key text PRIMARY KEY,
  attempts int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_blocked ON public.auth_rate_limits(blocked_until);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_last ON public.auth_rate_limits(last_attempt_at);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view auth_rate_limits" ON public.auth_rate_limits;
CREATE POLICY "Admins can view auth_rate_limits"
  ON public.auth_rate_limits FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text,
  _max int,
  _window_seconds int,
  _block_seconds int
)
RETURNS TABLE (allowed boolean, retry_after_seconds int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.auth_rate_limits%ROWTYPE;
  _now timestamptz := now();
BEGIN
  INSERT INTO public.auth_rate_limits (bucket_key, attempts, window_start, last_attempt_at)
  VALUES (_bucket, 1, _now, _now)
  ON CONFLICT (bucket_key) DO UPDATE
    SET attempts = CASE
        WHEN public.auth_rate_limits.blocked_until IS NOT NULL
             AND public.auth_rate_limits.blocked_until > _now
          THEN public.auth_rate_limits.attempts
        WHEN _now - public.auth_rate_limits.window_start > make_interval(secs => _window_seconds)
          THEN 1
        ELSE public.auth_rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN public.auth_rate_limits.blocked_until IS NOT NULL
             AND public.auth_rate_limits.blocked_until > _now
          THEN public.auth_rate_limits.window_start
        WHEN _now - public.auth_rate_limits.window_start > make_interval(secs => _window_seconds)
          THEN _now
        ELSE public.auth_rate_limits.window_start
      END,
      last_attempt_at = _now
  RETURNING * INTO _row;

  -- Apply block if newly exceeded
  IF (_row.blocked_until IS NULL OR _row.blocked_until <= _now) AND _row.attempts > _max THEN
    UPDATE public.auth_rate_limits
       SET blocked_until = _now + make_interval(secs => _block_seconds)
     WHERE bucket_key = _bucket
    RETURNING * INTO _row;
  END IF;

  IF _row.blocked_until IS NOT NULL AND _row.blocked_until > _now THEN
    RETURN QUERY SELECT false, GREATEST(1, EXTRACT(EPOCH FROM (_row.blocked_until - _now))::int);
  ELSE
    RETURN QUERY SELECT true, 0;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int, int) TO service_role;

-- 4. Idempotência guest list
CREATE UNIQUE INDEX IF NOT EXISTS uniq_guest_entry_per_list_public
  ON public.guest_list_entries (guest_list_id, lower(trim(name)))
  WHERE added_by = 'public';

-- 5. Índices de performance
CREATE INDEX IF NOT EXISTS idx_tickets_event_status     ON public.tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_lot_status       ON public.tickets(lot_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_event_status      ON public.orders(event_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_pending_expires   ON public.orders(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_checkin_logs_event_created ON public.checkin_logs(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_webhook_processed     ON public.mp_webhook_events(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_captured ON public.system_health_snapshots(captured_at DESC);
