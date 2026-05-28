
-- 1) event_seats.order_id (marcador de "order em voo" + sinal de mesa)
ALTER TABLE public.event_seats
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_seats_order_id
  ON public.event_seats(order_id) WHERE order_id IS NOT NULL;

-- 2) tickets: lot_id nullable + vínculo ao assento
ALTER TABLE public.tickets ALTER COLUMN lot_id DROP NOT NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS event_seat_id uuid REFERENCES public.event_seats(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seat_label text;

CREATE INDEX IF NOT EXISTS idx_tickets_event_seat_id
  ON public.tickets(event_seat_id) WHERE event_seat_id IS NOT NULL;

-- 3) release_seats (usuário) — limpa order_id
CREATE OR REPLACE FUNCTION public.release_seats(_event_id uuid, _hold_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _released int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF _hold_token IS NULL OR length(_hold_token) = 0 THEN
    RAISE EXCEPTION 'missing_token' USING ERRCODE = '22023';
  END IF;

  WITH upd AS (
    UPDATE public.event_seats
       SET status='available', held_by_user_id=NULL, hold_token=NULL,
           hold_expires_at=NULL, order_id=NULL, updated_at=now()
     WHERE event_id=_event_id
       AND hold_token=_hold_token
       AND status='held'
       AND held_by_user_id=_uid
    RETURNING id
  )
  SELECT count(*) INTO _released FROM upd;

  RETURN jsonb_build_object('released', _released);
END;$$;

-- 4) sweeper — limpa order_id
CREATE OR REPLACE FUNCTION public.sweep_expired_event_seat_holds()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  WITH upd AS (
    UPDATE public.event_seats
       SET status='available', held_by_user_id=NULL, hold_token=NULL,
           hold_expires_at=NULL, order_id=NULL, updated_at=now()
     WHERE status='held' AND hold_expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO _n FROM upd;
  RETURN _n;
END;$$;

-- 5) release_seats_admin (edges) — só libera se a order NÃO está com pagamento aceito
CREATE OR REPLACE FUNCTION public.release_seats_admin(_event_id uuid, _hold_token text, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  IF _event_id IS NULL OR _hold_token IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'missing_arg' USING ERRCODE = '22023';
  END IF;

  WITH upd AS (
    UPDATE public.event_seats es
       SET status='available', held_by_user_id=NULL, hold_token=NULL,
           hold_expires_at=NULL, order_id=NULL, updated_at=now()
     WHERE es.event_id        = _event_id
       AND es.hold_token      = _hold_token
       AND es.held_by_user_id = _user_id
       AND es.status          = 'held'
       AND (
            es.order_id IS NULL
         OR EXISTS (
              SELECT 1 FROM public.orders o
               WHERE o.id = es.order_id AND o.status = 'pending'
            )
       )
    RETURNING id
  )
  SELECT count(*) INTO _n FROM upd;

  RETURN jsonb_build_object('released', _n);
END;$$;

REVOKE ALL ON FUNCTION public.release_seats_admin(uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_seats_admin(uuid,text,uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_seats_admin(uuid,text,uuid) TO service_role;

-- 6) create_seat_order — fonte única de preço, guard anti-double-submit, IS DISTINCT FROM
CREATE OR REPLACE FUNCTION public.create_seat_order(
  _event_id      uuid,
  _user_id       uuid,
  _hold_token    text,
  _seats         jsonb,           -- [{ "seat_id": uuid, "addons": int }, ...]
  _fee_percent   numeric,
  _fee_fixed     numeric,
  _customer_name text,
  _customer_email text,
  _customer_cpf  text,
  _customer_phone text,
  _payment_method text,           -- 'pix' | 'card'
  _window         interval DEFAULT '00:15:00'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  -- Args
  IF _event_id IS NULL OR _user_id IS NULL OR _hold_token IS NULL THEN
    RAISE EXCEPTION 'missing_arg' USING ERRCODE = '22023';
  END IF;
  IF _seats IS NULL OR jsonb_array_length(_seats) = 0 THEN
    RAISE EXCEPTION 'no_seats' USING ERRCODE = '22023';
  END IF;
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'invalid_payment_method:%', _payment_method USING ERRCODE = '22023';
  END IF;

  _norm_cpf := NULLIF(regexp_replace(coalesce(_customer_cpf,''), '\D', '', 'g'), '');

  -- Cria order pendente (placeholder; total recalculado abaixo)
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

  -- Itera assentos sob FOR UPDATE
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

    -- Guard anti-double-submit: assento já está em outra order em voo
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

    _resolved_qty := COALESCE(_seat_row.base_capacity, 1)
                   + LEAST(_addons,
                           GREATEST(0,
                                    COALESCE(_seat_row.max_capacity,0)
                                  - COALESCE(_seat_row.base_capacity,0)));
    _line_price   := COALESCE(_seat_row.base_price, 0)
                   + (_addons * COALESCE(_seat_row.extra_price, 0));
    _subtotal     := _subtotal + _line_price;

    -- Marca order_id + estende hold para a janela do pedido
    UPDATE public.event_seats
       SET order_id        = _order_id,
           hold_expires_at = _expires_at,
           updated_at      = now()
     WHERE id = _seat_id;

    -- Cria tickets (1 por pessoa). lot_id NULL = ingresso de mesa.
    INSERT INTO public.tickets(order_id, event_id, lot_id, status, event_seat_id, seat_label)
    SELECT _order_id, _event_id, NULL, 'pending', _seat_id,
           COALESCE(_seat_row.label, _seat_row.code)
      FROM generate_series(1, _resolved_qty);
  END LOOP;

  -- Fee de fonte única
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
END;$$;

REVOKE ALL ON FUNCTION public.create_seat_order(
  uuid,uuid,text,jsonb,numeric,numeric,text,text,text,text,text,interval
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_seat_order(
  uuid,uuid,text,jsonb,numeric,numeric,text,text,text,text,text,interval
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_seat_order(
  uuid,uuid,text,jsonb,numeric,numeric,text,text,text,text,text,interval
) TO service_role;
