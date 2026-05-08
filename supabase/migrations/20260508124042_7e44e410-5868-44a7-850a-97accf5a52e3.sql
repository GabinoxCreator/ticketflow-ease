-- IDEMPOTENT 2026-05-08
-- Originally regenerated CRON_SECRET on every replay. Now: only creates the
-- vault entry if it does not exist, so remix/restore preserves the secret.
-- Vault is the single source of truth — both cron jobs and edge functions
-- read from vault.decrypted_secrets via public.get_cron_secret().

-- 1) Ensure CRON_SECRET exists in vault (no-op if already present)
DO $$
DECLARE
  _existing_id uuid;
BEGIN
  SELECT id INTO _existing_id FROM vault.secrets WHERE name = 'CRON_SECRET';
  IF _existing_id IS NULL THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'CRON_SECRET',
      'Shared secret used by pg_cron jobs to authenticate against edge functions'
    );
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
