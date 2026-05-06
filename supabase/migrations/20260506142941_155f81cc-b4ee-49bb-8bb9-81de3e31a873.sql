DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'health-snapshot-every-minute') THEN
    PERFORM cron.unschedule('health-snapshot-every-minute');
  END IF;
END $$;

SELECT cron.schedule(
  'health-snapshot-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/health-snapshot',
    headers:=jsonb_build_object('Content-Type','application/json','X-Cron-Secret', current_setting('app.cron_secret', true)),
    body:='{}'::jsonb
  );
  $$
);