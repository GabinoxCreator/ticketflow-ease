CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(p_payout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status
  FROM public.payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_not_found');
  END IF;

  IF v_status <> 'requested' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'current_status', v_status);
  END IF;

  UPDATE public.payouts
  SET status = 'paid',
      paid_at = now()
  WHERE id = p_payout_id;

  RETURN jsonb_build_object('ok', true, 'id', p_payout_id, 'status', 'paid', 'paid_at', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;