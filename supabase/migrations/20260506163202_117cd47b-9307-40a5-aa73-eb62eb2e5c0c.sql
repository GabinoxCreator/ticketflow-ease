-- Schedule hourly cleanup for auth_rate_limits
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auth_rate_limits_cleanup') THEN
    PERFORM cron.unschedule('auth_rate_limits_cleanup');
  END IF;
END $$;

SELECT cron.schedule(
  'auth_rate_limits_cleanup',
  '0 * * * *',
  $$
  DELETE FROM public.auth_rate_limits
   WHERE last_attempt_at < now() - interval '24 hours'
     AND (blocked_until IS NULL OR blocked_until < now());
  $$
);