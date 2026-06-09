CREATE OR REPLACE FUNCTION public.request_payout(p_event_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event           RECORD;
  _net_revenue     numeric;
  _already_paid    numeric;
  _already_req     numeric;
  _available       numeric;
  _bank            jsonb;
  _payout_id       uuid;
BEGIN
  SELECT id, producer_id, producer_profile_id
    INTO _event
    FROM public.events
   WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  IF _event.producer_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_event_owner');
  END IF;

  SELECT GREATEST(0,
           COALESCE(SUM(total_amount), 0) - COALESCE(SUM(service_fee_amount), 0))
    INTO _net_revenue
    FROM public.orders
   WHERE event_id = p_event_id
     AND status IN ('paid', 'completed')
     AND sale_origin <> 'courtesy';

  SELECT COALESCE(SUM(net_amount), 0)
    INTO _already_paid
    FROM public.payouts
   WHERE event_id = p_event_id
     AND status = 'paid';

  SELECT COALESCE(SUM(net_amount), 0)
    INTO _already_req
    FROM public.payouts
   WHERE event_id = p_event_id
     AND status = 'requested';

  _available := _net_revenue - _already_paid - _already_req;
  IF _available <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_available_balance');
  END IF;

  SELECT to_jsonb(b.*)
    INTO _bank
    FROM public.producer_bank_accounts b
   WHERE b.user_id = p_user_id
   LIMIT 1;
  IF _bank IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_bank_account');
  END IF;

  INSERT INTO public.payouts (
    producer_profile_id, event_id,
    gross_amount, platform_fee, net_amount,
    status, period_start, period_end,
    bank_account_snapshot
  ) VALUES (
    _event.producer_profile_id, p_event_id,
    _available, 0, _available,
    'requested', now(), now(),
    _bank
  )
  RETURNING id INTO _payout_id;

  RETURN jsonb_build_object('ok', true, 'payout_id', _payout_id, 'amount', _available);

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_requested');
END;
$$;

REVOKE ALL ON FUNCTION public.request_payout(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_payout(uuid, uuid) TO service_role;