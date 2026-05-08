-- Helper to read cron telemetry safely from health-snapshot.
-- Reads cron.job_run_details for the two known jobs and aggregates last hour stats.
CREATE OR REPLACE FUNCTION public.get_cron_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
DECLARE
  _result jsonb;
  _last_run timestamptz;
  _last_status text;
  _runs_last_hour int := 0;
  _failed_last_hour int := 0;
  _one_hour_ago timestamptz := now() - interval '1 hour';
BEGIN
  -- Most recent run across our known jobs
  SELECT jrd.start_time, jrd.status
    INTO _last_run, _last_status
    FROM cron.job_run_details jrd
    JOIN cron.job j ON j.jobid = jrd.jobid
   WHERE j.jobname IN ('expire-pending-orders-every-minute', 'health-snapshot-every-minute')
   ORDER BY jrd.start_time DESC
   LIMIT 1;

  SELECT
    count(*)::int,
    count(*) FILTER (WHERE jrd.status <> 'succeeded')::int
    INTO _runs_last_hour, _failed_last_hour
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname IN ('expire-pending-orders-every-minute', 'health-snapshot-every-minute')
    AND jrd.start_time >= _one_hour_ago;

  _result := jsonb_build_object(
    'last_run_at', _last_run,
    'last_status', _last_status,
    'runs_last_hour', _runs_last_hour,
    'failed_last_hour', _failed_last_hour
  );
  RETURN _result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'last_run_at', NULL,
    'last_status', NULL,
    'runs_last_hour', 0,
    'failed_last_hour', 0,
    'error', SQLERRM
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cron_health() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_health() TO service_role;