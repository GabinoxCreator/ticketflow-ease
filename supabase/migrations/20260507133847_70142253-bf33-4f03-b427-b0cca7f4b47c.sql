-- M2: unique index on mp_payment_id (M1 normalization not needed; no empty strings exist)
CREATE UNIQUE INDEX IF NOT EXISTS orders_mp_payment_id_uniq
  ON public.orders(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

-- Helpful supporting index
CREATE INDEX IF NOT EXISTS orders_status_expires_at_idx
  ON public.orders(status, expires_at);

-- M3: RPC apply_order_approved
CREATE OR REPLACE FUNCTION public.apply_order_approved(
  _order_id uuid,
  _mp_payment_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _system_actor uuid := '95628c4a-8040-44ed-83c5-d6a5b8793926';
  _order RECORD;
  _first_transition boolean := false;
  _tickets_fixed int := 0;
  _mismatch boolean := false;
  _lot RECORD;
  _ok boolean;
  _confirmed_count int := 0;
  _failed_lots jsonb := '[]'::jsonb;
BEGIN
  -- Lock the order row
  SELECT id, status, coupon_id, user_id, total_amount
    INTO _order
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found:%', _order_id;
  END IF;

  IF _order.status = 'pending' THEN
    -- First transition pending -> paid
    UPDATE public.orders
       SET status = 'paid',
           mp_payment_id = COALESCE(_mp_payment_id, mp_payment_id),
           expires_at = NULL,
           updated_at = now()
     WHERE id = _order_id
       AND status = 'pending';

    _first_transition := true;

    -- Confirm inventory per lot for pending tickets
    FOR _lot IN
      SELECT lot_id, count(*)::int AS qty
        FROM public.tickets
       WHERE order_id = _order_id
         AND status = 'pending'
       GROUP BY lot_id
    LOOP
      SELECT public.confirm_lot_sale(_lot.lot_id, _lot.qty) INTO _ok;
      IF COALESCE(_ok, false) THEN
        _confirmed_count := _confirmed_count + _lot.qty;
      ELSE
        _failed_lots := _failed_lots || jsonb_build_object('lot_id', _lot.lot_id, 'qty', _lot.qty);
      END IF;
    END LOOP;

    IF jsonb_array_length(_failed_lots) > 0 THEN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES (
        _system_actor,
        'apply_order_approved_inventory_partial',
        'order',
        _order_id,
        jsonb_build_object(
          'mp_payment_id', _mp_payment_id,
          'failed_lots', _failed_lots
        )
      );
    END IF;

    -- Validate pending tickets
    UPDATE public.tickets
       SET status = 'valid'
     WHERE order_id = _order_id
       AND status = 'pending';
    GET DIAGNOSTICS _tickets_fixed = ROW_COUNT;

    -- Coupon increment (only on first transition)
    IF _order.coupon_id IS NOT NULL THEN
      UPDATE public.event_coupons
         SET uses_count = COALESCE(uses_count, 0) + 1,
             updated_at = now()
       WHERE id = _order.coupon_id;
    END IF;

    RETURN jsonb_build_object(
      'first_transition', true,
      'tickets_fixed', _tickets_fixed,
      'mismatch', false
    );

  ELSIF _order.status = 'paid' THEN
    -- Reconciliation only: fix leftover pending tickets, no inventory/coupon side effects
    UPDATE public.tickets
       SET status = 'valid'
     WHERE order_id = _order_id
       AND status = 'pending';
    GET DIAGNOSTICS _tickets_fixed = ROW_COUNT;

    IF _tickets_fixed > 0 THEN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES (
        _system_actor,
        'apply_order_approved_tickets_reconciled',
        'order',
        _order_id,
        jsonb_build_object(
          'mp_payment_id', _mp_payment_id,
          'tickets_fixed', _tickets_fixed
        )
      );
    END IF;

    RETURN jsonb_build_object(
      'first_transition', false,
      'tickets_fixed', _tickets_fixed,
      'mismatch', false
    );

  ELSE
    -- Terminal non-paid status (expired, cancelled, failed, refunded, charged_back)
    INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (
      _system_actor,
      'apply_order_approved_terminal_mismatch',
      'order',
      _order_id,
      jsonb_build_object(
        'order_status', _order.status,
        'mp_payment_id', _mp_payment_id
      )
    );

    RETURN jsonb_build_object(
      'first_transition', false,
      'tickets_fixed', 0,
      'mismatch', true,
      'order_status', _order.status
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- Re-raise: caller logs (helper will insert audit_log on failure)
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_order_approved(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_order_approved(uuid, text) TO service_role, authenticated;