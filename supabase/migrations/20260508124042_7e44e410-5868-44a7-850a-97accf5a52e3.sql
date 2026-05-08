
-- 1) Generate a fresh CRON_SECRET and (re)store it in vault
DO $$
DECLARE
  _new_secret text := encode(gen_random_bytes(32), 'hex');
  _existing_id uuid;
BEGIN
  SELECT id INTO _existing_id FROM vault.secrets WHERE name = 'CRON_SECRET';
  IF _existing_id IS NULL THEN
    PERFORM vault.create_secret(_new_secret, 'CRON_SECRET', 'Shared secret used by pg_cron jobs to authenticate against edge functions');
  ELSE
    PERFORM vault.update_secret(_existing_id, _new_secret, 'CRON_SECRET', 'Shared secret used by pg_cron jobs to authenticate against edge functions');
  END IF;
END $$;

-- 2) Recreate cron jobs so BOTH read the secret from the same vault entry
SELECT cron.unschedule('expire-pending-orders-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-pending-orders-every-minute');

SELECT cron.unschedule('health-snapshot-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'health-snapshot-every-minute');

SELECT cron.schedule(
  'expire-pending-orders-every-minute',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/expire-pending-orders',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('source','cron')
  );
  $job$
);

SELECT cron.schedule(
  'health-snapshot-every-minute',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/health-snapshot',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- 3) Echo the new value so the operator can paste it into the edge env CRON_SECRET
SELECT decrypted_secret AS cron_secret_value_to_paste_into_env
FROM vault.decrypted_secrets
WHERE name = 'CRON_SECRET'
LIMIT 1;
