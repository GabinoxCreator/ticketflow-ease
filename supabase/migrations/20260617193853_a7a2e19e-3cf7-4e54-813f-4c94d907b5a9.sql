CREATE OR REPLACE FUNCTION public.admin_set_event_fee(
  p_event_id     uuid,
  p_pix_percent  numeric,
  p_pix_fixed    numeric,
  p_card_percent numeric,
  p_card_fixed   numeric
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exists boolean;
  _before jsonb;
  _after  jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id) INTO _exists;
  IF NOT _exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  IF p_pix_percent  IS NULL OR p_pix_percent  < 0 OR p_pix_percent  > 100
  OR p_card_percent IS NULL OR p_card_percent < 0 OR p_card_percent > 100
  OR p_pix_fixed    IS NULL OR p_pix_fixed    < 0
  OR p_card_fixed   IS NULL OR p_card_fixed   < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_value');
  END IF;

  SELECT COALESCE(jsonb_object_agg(payment_method,
            jsonb_build_object('percent', fee_percent, 'fixed', fee_fixed)),
          '{}'::jsonb)
    INTO _before
    FROM public.event_fee_overrides
   WHERE event_id = p_event_id
     AND payment_method IN ('pix','card');

  INSERT INTO public.event_fee_overrides (event_id, payment_method, fee_percent, fee_fixed)
  VALUES (p_event_id, 'pix', p_pix_percent, p_pix_fixed)
  ON CONFLICT (event_id, payment_method)
  DO UPDATE SET fee_percent = EXCLUDED.fee_percent,
                fee_fixed   = EXCLUDED.fee_fixed;

  INSERT INTO public.event_fee_overrides (event_id, payment_method, fee_percent, fee_fixed)
  VALUES (p_event_id, 'card', p_card_percent, p_card_fixed)
  ON CONFLICT (event_id, payment_method)
  DO UPDATE SET fee_percent = EXCLUDED.fee_percent,
                fee_fixed   = EXCLUDED.fee_fixed;

  _after := jsonb_build_object(
    'pix',  jsonb_build_object('percent', p_pix_percent,  'fixed', p_pix_fixed),
    'card', jsonb_build_object('percent', p_card_percent, 'fixed', p_card_fixed)
  );

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'set_event_fee',
    'event',
    p_event_id,
    jsonb_build_object('antes', _before, 'depois', _after)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'pix',  jsonb_build_object('percent', p_pix_percent,  'fixed', p_pix_fixed),
    'card', jsonb_build_object('percent', p_card_percent, 'fixed', p_card_fixed)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_event_fee(uuid,numeric,numeric,numeric,numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_event_fee(uuid,numeric,numeric,numeric,numeric) TO authenticated;