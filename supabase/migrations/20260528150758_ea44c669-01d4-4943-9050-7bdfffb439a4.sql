-- Parte B1: apply_order_approved aceita mesa + release_seats_for_order
-- Decisões críticas:
--  1) UPDATE event_seats status='sold' roda INCONDICIONALMENTE em qualquer order
--     aprovada — fora do guard _total_tickets=0 (que só protege ingresso) e fora
--     do loop de lotes. Mesa tem _total_tickets > 0 sempre (create_seat_order
--     emite generate_series), mas a defesa em profundidade é explícita.
--  2) Idempotência: pending→paid é guarded (WHERE status='pending'); o ELSIF paid
--     re-executa o sweep de seats que é no-op (WHERE status='held'); coupon
--     uses_count só sobe no ramo pending (não re-executa).
--  3) `AND lot_id IS NOT NULL` no FOR _lot exclui tickets de mesa (lot_id NULL).
--     Ingresso continua igual (lot_id sempre setado).

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
    -- HARD GUARD (somente ingresso pode hit isto; mesa sempre cria tickets >= 1).
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

    -- MESA: confirma assentos held -> sold. INCONDICIONAL.
    -- No-op para ingresso (sem rows em event_seats com este order_id).
    -- Idempotente: 2ª entrega do webhook não casa (status já 'sold').
    UPDATE public.event_seats
       SET status = 'sold',
           hold_token = NULL,
           hold_expires_at = NULL,
           updated_at = now()
     WHERE order_id = _order_id
       AND status = 'held';
    GET DIAGNOSTICS _seats_confirmed = ROW_COUNT;

    -- INGRESSO: confirma estoque por lote. `lot_id IS NOT NULL` exclui tickets
    -- de mesa (que têm lot_id NULL); ingresso sempre tem lot_id setado.
    FOR _lot IN
      SELECT lot_id, count(*)::int AS qty
        FROM public.tickets
       WHERE order_id = _order_id
         AND status = 'pending'
         AND lot_id IS NOT NULL
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

    -- Promove TODOS os tickets pending (ingresso e mesa) a valid.
    UPDATE public.tickets
       SET status = 'valid'
     WHERE order_id = _order_id
       AND status = 'pending';
    GET DIAGNOSTICS _tickets_fixed = ROW_COUNT;

    -- Coupon: só no ramo pending. Webhook reentry entra no ELSIF paid abaixo,
    -- portanto uses_count NUNCA é incrementado 2x.
    IF _order.coupon_id IS NOT NULL THEN
      UPDATE public.event_coupons
         SET uses_count = COALESCE(uses_count, 0) + 1,
             updated_at = now()
       WHERE id = _order.coupon_id;
    END IF;

    RETURN jsonb_build_object(
      'first_transition', true,
      'tickets_fixed', _tickets_fixed,
      'seats_confirmed', _seats_confirmed,
      'mismatch', false
    );

  ELSIF _order.status = 'paid' THEN
    -- Defesa em profundidade: caso o 1º webhook tenha promovido a order mas
    -- não os seats (ex: crash entre os dois UPDATEs), o sweep aqui conclui.
    -- No-op se a 1ª passada já vendeu (WHERE status='held' não casa).
    UPDATE public.event_seats
       SET status = 'sold',
           hold_token = NULL,
           hold_expires_at = NULL,
           updated_at = now()
     WHERE order_id = _order_id
       AND status = 'held';
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
     WHERE order_id = _order_id
       AND status = 'pending';
    GET DIAGNOSTICS _tickets_fixed = ROW_COUNT;

    IF _tickets_fixed > 0 OR _seats_confirmed > 0 THEN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES (_system_actor, 'apply_order_approved_tickets_reconciled', 'order', _order_id,
              jsonb_build_object('mp_payment_id', _mp_payment_id,
                                 'tickets_fixed', _tickets_fixed,
                                 'seats_confirmed', _seats_confirmed));
    END IF;

    RETURN jsonb_build_object('first_transition', false,
                              'tickets_fixed', _tickets_fixed,
                              'seats_confirmed', _seats_confirmed,
                              'mismatch', false);

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

-- ===========================================================================
-- release_seats_for_order: solta assentos held de uma order específica.
-- Chamada no ramo rejected/cancelled do webhook e na saída rejected do
-- charge-seat-card. NÃO consulta orders.status pra evitar race com o UPDATE
-- que o webhook acabou de fazer; soltar held da order rejeitada é sempre seguro.
-- service_role apenas (sem auth.uid()).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.release_seats_for_order(_order_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  IF _order_id IS NULL THEN
    RAISE EXCEPTION 'missing_arg' USING ERRCODE = '22023';
  END IF;

  WITH upd AS (
    UPDATE public.event_seats
       SET status = 'available',
           held_by_user_id = NULL,
           hold_token = NULL,
           hold_expires_at = NULL,
           order_id = NULL,
           updated_at = now()
     WHERE order_id = _order_id
       AND status = 'held'
    RETURNING id
  )
  SELECT count(*)::int INTO _n FROM upd;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.release_seats_for_order(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_seats_for_order(uuid) TO service_role;
