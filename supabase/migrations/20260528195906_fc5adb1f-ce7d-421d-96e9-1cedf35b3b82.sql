
-- Fase 10: Detecção de entrega parcial/falha em pedidos de mesa
-- Schema: flags review_status/review_reason/review_flagged_at na tabela orders

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS review_reason jsonb,
  ADD COLUMN IF NOT EXISTS review_flagged_at timestamptz;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_review_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_review_status_check
  CHECK (review_status IS NULL OR review_status IN ('partial_delivery','paid_no_delivery'));

CREATE INDEX IF NOT EXISTS orders_review_status_idx
  ON public.orders(review_status)
  WHERE review_status IS NOT NULL;

-- ===========================================================================
-- apply_order_approved: adiciona detecção (a) partial_delivery nos 2 ramos
-- (pending e paid). Ramo ELSE INTOCADO (continua só com audit terminal_mismatch
-- — o flag (b) paid_no_delivery vive no webhook, depois do gate approved+amount).
-- ===========================================================================
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
  _seats_confirmed int := 0;
  _lot RECORD;
  _ok boolean;
  _failed_lots jsonb := '[]'::jsonb;
  _total_tickets int := 0;
  _pending_tickets int := 0;
  _expected_seats int := 0;
  _delivered_seats int := 0;
  _flagged int := 0;
BEGIN
  SELECT id, status, coupon_id, user_id, total_amount
    INTO _order
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found:%', _order_id;
  END IF;

  SELECT
    count(*)::int,
    count(*) FILTER (WHERE status = 'pending')::int
    INTO _total_tickets, _pending_tickets
  FROM public.tickets
  WHERE order_id = _order_id;

  IF _order.status = 'pending' THEN
    IF _total_tickets = 0 THEN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES (_system_actor, 'paid_without_tickets_blocked', 'order', _order_id,
              jsonb_build_object('mp_payment_id', _mp_payment_id,
                                 'order_status_before', _order.status,
                                 'reason', 'no tickets attached to order; refusing to promote to paid'));
      RETURN jsonb_build_object('first_transition', false, 'tickets_fixed', 0,
                                'mismatch', true, 'order_status', _order.status,
                                'reason', 'no_tickets');
    END IF;

    UPDATE public.orders
       SET status = 'paid',
           mp_payment_id = COALESCE(_mp_payment_id, mp_payment_id),
           expires_at = NULL,
           updated_at = now()
     WHERE id = _order_id
       AND status = 'pending';

    UPDATE public.event_seats
       SET status = 'sold', hold_token = NULL, hold_expires_at = NULL, updated_at = now()
     WHERE order_id = _order_id AND status = 'held';
    GET DIAGNOSTICS _seats_confirmed = ROW_COUNT;

    FOR _lot IN
      SELECT lot_id, count(*)::int AS qty
        FROM public.tickets
       WHERE order_id = _order_id AND status = 'pending' AND lot_id IS NOT NULL
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
     WHERE order_id = _order_id AND status = 'pending';
    GET DIAGNOSTICS _tickets_fixed = ROW_COUNT;

    IF _order.coupon_id IS NOT NULL THEN
      UPDATE public.event_coupons
         SET uses_count = COALESCE(uses_count, 0) + 1, updated_at = now()
       WHERE id = _order.coupon_id;
    END IF;

    -- Fase 10 sabor (a): detecção de entrega parcial de mesa.
    -- Estado atual: comparar tickets de mesa esperados vs assentos sold.
    -- Idempotente: WHERE review_status IS NULL.
    SELECT count(DISTINCT event_seat_id) INTO _expected_seats
      FROM public.tickets
     WHERE order_id = _order_id AND event_seat_id IS NOT NULL;

    IF _expected_seats > 0 THEN
      SELECT count(DISTINCT id) INTO _delivered_seats
        FROM public.event_seats
       WHERE order_id = _order_id AND status = 'sold';

      IF _delivered_seats < _expected_seats THEN
        UPDATE public.orders
           SET review_status = 'partial_delivery',
               review_reason = jsonb_build_object(
                 'expected', _expected_seats,
                 'delivered', _delivered_seats,
                 'mp_payment_id', _mp_payment_id,
                 'detected_at', now(),
                 'flavor', 'a_partial'),
               review_flagged_at = now(),
               updated_at = now()
         WHERE id = _order_id AND review_status IS NULL;
        GET DIAGNOSTICS _flagged = ROW_COUNT;

        IF _flagged > 0 THEN
          INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
          VALUES (_system_actor, 'order_partial_delivery_detected', 'order', _order_id,
                  jsonb_build_object('expected', _expected_seats,
                                     'delivered', _delivered_seats,
                                     'mp_payment_id', _mp_payment_id,
                                     'branch', 'pending'));
        END IF;
      END IF;
    END IF;

    RETURN jsonb_build_object('first_transition', true,
                              'tickets_fixed', _tickets_fixed,
                              'seats_confirmed', _seats_confirmed,
                              'mismatch', false);

  ELSIF _order.status = 'paid' THEN
    UPDATE public.event_seats
       SET status = 'sold', hold_token = NULL, hold_expires_at = NULL, updated_at = now()
     WHERE order_id = _order_id AND status = 'held';
    GET DIAGNOSTICS _seats_confirmed = ROW_COUNT;

    IF _total_tickets = 0 THEN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES (_system_actor, 'paid_without_tickets_detected', 'order', _order_id,
              jsonb_build_object('mp_payment_id', _mp_payment_id,
                                 'note', 'order is paid but has zero tickets; manual review required'));
      RETURN jsonb_build_object('first_transition', false, 'tickets_fixed', 0,
                                'seats_confirmed', _seats_confirmed,
                                'mismatch', true, 'order_status', 'paid', 'reason', 'no_tickets');
    END IF;

    UPDATE public.tickets
       SET status = 'valid'
     WHERE order_id = _order_id AND status = 'pending';
    GET DIAGNOSTICS _tickets_fixed = ROW_COUNT;

    IF _tickets_fixed > 0 OR _seats_confirmed > 0 THEN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES (_system_actor, 'apply_order_approved_tickets_reconciled', 'order', _order_id,
              jsonb_build_object('mp_payment_id', _mp_payment_id,
                                 'tickets_fixed', _tickets_fixed,
                                 'seats_confirmed', _seats_confirmed));
    END IF;

    -- Fase 10 sabor (a): mesma detecção no sweep paid.
    SELECT count(DISTINCT event_seat_id) INTO _expected_seats
      FROM public.tickets
     WHERE order_id = _order_id AND event_seat_id IS NOT NULL;

    IF _expected_seats > 0 THEN
      SELECT count(DISTINCT id) INTO _delivered_seats
        FROM public.event_seats
       WHERE order_id = _order_id AND status = 'sold';

      IF _delivered_seats < _expected_seats THEN
        UPDATE public.orders
           SET review_status = 'partial_delivery',
               review_reason = jsonb_build_object(
                 'expected', _expected_seats,
                 'delivered', _delivered_seats,
                 'mp_payment_id', _mp_payment_id,
                 'detected_at', now(),
                 'flavor', 'a_partial'),
               review_flagged_at = now(),
               updated_at = now()
         WHERE id = _order_id AND review_status IS NULL;
        GET DIAGNOSTICS _flagged = ROW_COUNT;

        IF _flagged > 0 THEN
          INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
          VALUES (_system_actor, 'order_partial_delivery_detected', 'order', _order_id,
                  jsonb_build_object('expected', _expected_seats,
                                     'delivered', _delivered_seats,
                                     'mp_payment_id', _mp_payment_id,
                                     'branch', 'paid_sweep'));
        END IF;
      END IF;
    END IF;

    RETURN jsonb_build_object('first_transition', false,
                              'tickets_fixed', _tickets_fixed,
                              'seats_confirmed', _seats_confirmed,
                              'mismatch', false);

  ELSE
    -- Order terminal (expired/failed/cancelled/refunded/...). NÃO flagga aqui.
    -- O flag paid_no_delivery (sabor b) vive no webhook, depois que validou
    -- approved + amount, via flag_order_paid_no_delivery. Aqui só audita.
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

-- ===========================================================================
-- flag_order_paid_no_delivery: SÓ chamada pelo webhook depois do gate
-- approved+amount, quando applyOrderApproved retorna mismatch porque a order
-- está em estado terminal. Idempotente e específica para mesa.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.flag_order_paid_no_delivery(
  _order_id uuid,
  _mp_payment_id text,
  _transaction_amount numeric,
  _order_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _system_actor uuid := '95628c4a-8040-44ed-83c5-d6a5b8793926';
  _flagged int := 0;
BEGIN
  IF _order_id IS NULL THEN
    RAISE EXCEPTION 'missing_arg' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
     SET review_status = 'paid_no_delivery',
         review_reason = jsonb_build_object(
           'order_status', _order_status,
           'mp_payment_id', _mp_payment_id,
           'transaction_amount', _transaction_amount,
           'detected_at', now(),
           'flavor', 'b_terminal'),
         review_flagged_at = now(),
         updated_at = now()
   WHERE id = _order_id
     AND review_status IS NULL
     AND EXISTS (
       SELECT 1 FROM public.tickets
        WHERE order_id = _order_id AND event_seat_id IS NOT NULL
     );
  GET DIAGNOSTICS _flagged = ROW_COUNT;

  IF _flagged > 0 THEN
    INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (_system_actor, 'order_paid_no_delivery_detected', 'order', _order_id,
            jsonb_build_object('order_status', _order_status,
                               'mp_payment_id', _mp_payment_id,
                               'transaction_amount', _transaction_amount));
  END IF;

  RETURN _flagged > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.flag_order_paid_no_delivery(uuid, text, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_order_paid_no_delivery(uuid, text, numeric, text) TO service_role;
