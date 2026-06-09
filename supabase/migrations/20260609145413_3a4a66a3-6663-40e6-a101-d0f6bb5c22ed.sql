CREATE UNIQUE INDEX IF NOT EXISTS uniq_payout_requested_per_event
  ON public.payouts (event_id)
  WHERE status = 'requested';