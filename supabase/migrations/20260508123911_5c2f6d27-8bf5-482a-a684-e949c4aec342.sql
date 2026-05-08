
-- ============================================================
-- PART 1.A — Guard apply_order_approved against paid-without-tickets
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_order_approved(_order_id uuid, _mp_payment_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _system_actor uuid := '95628c4a-8040-44ed-83c5-d6a5b8793926';
  _order RECORD;
  _tickets_fixed int := 0;
  _lot RECORD;
  _ok boolean;
  _failed_lots jsonb := '[]'::jsonb;
  _total_tickets int := 0;
  _pending_tickets int := 0;
BEGIN
  SELECT id, status, coupon_id, user_id, total_amount
    INTO _order
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found:%', _order_id;
  END IF;

  -- Guard: count tickets attached to this order
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE status = 'pending')::int
    INTO _total_tickets, _pending_tickets
  FROM public.tickets
  WHERE order_id = _order_id;

  IF _order.status = 'pending' THEN
    -- HARD GUARD: never promote pending -> paid if no tickets exist at all.
    IF _total_tickets = 0 THEN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES (
        _system_actor,
        'paid_without_tickets_blocked',
        'order',
        _order_id,
        jsonb_build_object(
          'mp_payment_id', _mp_payment_id,
          'order_status_before', _order.status,
          'reason', 'no tickets attached to order; refusing to promote to paid'
        )
      );
      RETURN jsonb_build_object(
        'first_transition', false,
        'tickets_fixed', 0,
        'mismatch', true,
        'order_status', _order.status,
        'reason', 'no_tickets'
      );
    END IF;

    UPDATE public.orders
       SET status = 'paid',
           mp_payment_id = COALESCE(_mp_payment_id, mp_payment_id),
           expires_at = NULL,
           updated_at = now()
     WHERE id = _order_id
       AND status = 'pending';

    FOR _lot IN
      SELECT lot_id, count(*)::int AS qty
        FROM public.tickets
       WHERE order_id = _order_id
         AND status = 'pending'
       GROUP BY lot_id
    LOOP
      SELECT public.confirm_lot_sale(_lot.lot_id, _lot.qty) INTO _ok;
      IF NOT COALESCE(_ok, false) THEN
        _failed_lots := _failed_lots || jsonb_build_object('lot_id', _lot.lot_id, 'qty', _lot.qty);
      END IF;
    END LOOP;

    IF jsonb_array_length(_failed_lots) > 0 THEN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES (_system_actor, 'apply_order_approved_inventory_partial', 'order', _order_id,
              jsonb_build_object('mp_payment_id', _mp_payment_id, 'failed_lots', _failed_lots));
    END IF;

    UPDATE public.tickets
       SET status = 'valid'
     WHERE order_id = _order_id
       AND status = 'pending';
    GET DIAGNOSTICS _tickets_fixed = ROW_COUNT;

    IF _order.coupon_id IS NOT NULL THEN
      UPDATE public.event_coupons
         SET uses_count = COALESCE(uses_count, 0) + 1,
             updated_at = now()
       WHERE id = _order.coupon_id;
    END IF;

    RETURN jsonb_build_object('first_transition', true, 'tickets_fixed', _tickets_fixed, 'mismatch', false);

  ELSIF _order.status = 'paid' THEN
    -- Detect post-facto paid-without-tickets (data drift) and audit loudly.
    IF _total_tickets = 0 THEN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES (_system_actor, 'paid_without_tickets_detected', 'order', _order_id,
              jsonb_build_object('mp_payment_id', _mp_payment_id,
                                 'note', 'order is paid but has zero tickets; manual review required'));
      RETURN jsonb_build_object('first_transition', false, 'tickets_fixed', 0,
                                'mismatch', true, 'order_status', 'paid', 'reason', 'no_tickets');
    END IF;

    UPDATE public.tickets
       SET status = 'valid'
     WHERE order_id = _order_id
       AND status = 'pending';
    GET DIAGNOSTICS _tickets_fixed = ROW_COUNT;

    IF _tickets_fixed > 0 THEN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES (_system_actor, 'apply_order_approved_tickets_reconciled', 'order', _order_id,
              jsonb_build_object('mp_payment_id', _mp_payment_id, 'tickets_fixed', _tickets_fixed));
    END IF;

    RETURN jsonb_build_object('first_transition', false, 'tickets_fixed', _tickets_fixed, 'mismatch', false);

  ELSE
    INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (_system_actor, 'apply_order_approved_terminal_mismatch', 'order', _order_id,
            jsonb_build_object('order_status', _order.status, 'mp_payment_id', _mp_payment_id));
    RETURN jsonb_build_object('first_transition', false, 'tickets_fixed', 0,
                              'mismatch', true, 'order_status', _order.status);
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

-- ============================================================
-- PART 1.B — Audit the 3 known orphan paid orders right now
-- ============================================================
INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
SELECT
  '95628c4a-8040-44ed-83c5-d6a5b8793926'::uuid,
  'paid_without_tickets_detected',
  'order',
  o.id,
  jsonb_build_object(
    'mp_payment_id', o.mp_payment_id,
    'created_at', o.created_at,
    'total_amount', o.total_amount,
    'customer_email', o.customer_email,
    'note', 'historical orphan flagged by Part 1 hardening; manual review required'
  )
FROM public.orders o
WHERE o.status = 'paid'
  AND NOT EXISTS (SELECT 1 FROM public.tickets t WHERE t.order_id = o.id);
