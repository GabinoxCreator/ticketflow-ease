CREATE OR REPLACE FUNCTION public.create_seat_order(_event_id uuid, _user_id uuid, _hold_token text, _seats jsonb, _fee_percent numeric, _fee_fixed numeric, _customer_name text, _customer_email text, _customer_cpf text, _customer_phone text, _payment_method text, _window interval DEFAULT '00:15:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _now           timestamptz := now();
  _expires_at    timestamptz := _now + _window;
  _order_id      uuid;
  _subtotal      numeric := 0;
  _service_fee   numeric := 0;
  _total         numeric := 0;
  _seat_row      RECORD;
  _seat_id       uuid;
  _addons        int;
  _resolved_qty  int;
  _line_price    numeric;
  _norm_cpf      text;
BEGIN
  IF _event_id IS NULL OR _user_id IS NULL OR _hold_token IS NULL THEN
    RAISE EXCEPTION 'missing_arg' USING ERRCODE = '22023';
  END IF;
  IF _seats IS NULL OR jsonb_array_length(_seats) = 0 THEN
    RAISE EXCEPTION 'no_seats' USING ERRCODE = '22023';
  END IF;
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'invalid_payment_method:%', _payment_method USING ERRCODE = '22023';
  END IF;
  IF _customer_name IS NULL OR length(btrim(_customer_name)) = 0 THEN
    RAISE EXCEPTION 'missing_customer_name' USING ERRCODE = '22023';
  END IF;

  _norm_cpf := NULLIF(regexp_replace(coalesce(_customer_cpf,''), '\D', '', 'g'), '');

  INSERT INTO public.orders(
    event_id, user_id, status, total_amount, service_fee_amount, discount_amount,
    customer_name, customer_email, customer_cpf, customer_phone,
    payment_method, sale_origin, expires_at
  ) VALUES (
    _event_id, _user_id, 'pending', 0, 0, 0,
    _customer_name, _customer_email, _norm_cpf, _customer_phone,
    _payment_method, 'online', _expires_at
  )
  RETURNING id INTO _order_id;

  FOR _seat_id, _addons IN
    SELECT (s->>'seat_id')::uuid, GREATEST(0, COALESCE((s->>'addons')::int, 0))
      FROM jsonb_array_elements(_seats) s
  LOOP
    SELECT es.* INTO _seat_row
      FROM public.event_seats es
     WHERE es.id = _seat_id AND es.event_id = _event_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'seat_not_found:%', _seat_id USING ERRCODE = 'P0002';
    END IF;

    IF _seat_row.order_id IS NOT NULL AND _seat_row.order_id <> _order_id THEN
      RAISE EXCEPTION 'order_already_in_progress:%', _seat_id USING ERRCODE = 'P0001';
    END IF;

    IF _seat_row.status <> 'held' THEN
      RAISE EXCEPTION 'seat_not_held:%', _seat_id USING ERRCODE = 'P0001';
    END IF;
    IF _seat_row.hold_token IS DISTINCT FROM _hold_token THEN
      RAISE EXCEPTION 'invalid_hold_token:%', _seat_id USING ERRCODE = 'P0001';
    END IF;
    IF _seat_row.held_by_user_id IS DISTINCT FROM _user_id THEN
      RAISE EXCEPTION 'seat_not_yours:%', _seat_id USING ERRCODE = 'P0001';
    END IF;
    IF _seat_row.hold_expires_at IS NULL OR _seat_row.hold_expires_at < _now THEN
      RAISE EXCEPTION 'hold_expired:%', _seat_id USING ERRCODE = 'P0001';
    END IF;

    IF _addons > (COALESCE(_seat_row.max_capacity,0) - COALESCE(_seat_row.base_capacity,0)) THEN
      RAISE EXCEPTION 'addons_exceed_max:%', _seat_id USING ERRCODE = '22023';
    END IF;

    _resolved_qty := COALESCE(_seat_row.base_capacity, 1) + _addons;
    _line_price   := COALESCE(_seat_row.base_price, 0)
                   + (_addons * COALESCE(_seat_row.extra_price, 0));
    _subtotal     := _subtotal + _line_price;

    UPDATE public.event_seats
       SET order_id        = _order_id,
           hold_expires_at = _expires_at,
           updated_at      = now()
     WHERE id = _seat_id;

    INSERT INTO public.tickets(order_id, event_id, lot_id, status, event_seat_id, seat_label,
                               holder_name, holder_email, holder_phone, user_id)
    SELECT _order_id, _event_id, NULL, 'pending', _seat_id,
           COALESCE(_seat_row.label, _seat_row.code),
           _customer_name, _customer_email, _customer_phone, _user_id
      FROM generate_series(1, _resolved_qty);
  END LOOP;

  _service_fee := round((_subtotal * COALESCE(_fee_percent,0)/100
                       + COALESCE(_fee_fixed,0))::numeric, 2);
  _total       := GREATEST(0.01, _subtotal + _service_fee);

  UPDATE public.orders
     SET total_amount       = _total,
         service_fee_amount = _service_fee,
         updated_at         = now()
   WHERE id = _order_id;

  RETURN jsonb_build_object(
    'order_id',         _order_id,
    'subtotal',         _subtotal,
    'service_fee',      _service_fee,
    'total',            _total,
    'expires_at',       _expires_at,
    'tickets_created',  (SELECT count(*) FROM public.tickets WHERE order_id = _order_id)
  );
END;$function$;