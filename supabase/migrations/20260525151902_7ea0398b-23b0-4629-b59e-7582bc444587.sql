
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sale_origin text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS manual_payment_method text,
  ADD COLUMN IF NOT EXISTS manual_payment_note text,
  ADD COLUMN IF NOT EXISTS manual_sold_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS manual_fee_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_cpf text;

DO $$ BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_sale_origin_check
    CHECK (sale_origin IN ('online','manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_manual_payment_method_check
    CHECK (manual_payment_method IS NULL
           OR manual_payment_method IN ('pix','dinheiro','transferencia','cartao','outro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_orders_sale_origin    ON public.orders(sale_origin);
CREATE INDEX IF NOT EXISTS idx_orders_manual_sold_by ON public.orders(manual_sold_by) WHERE manual_sold_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_cpf   ON public.orders(customer_cpf)   WHERE customer_cpf   IS NOT NULL;

COMMENT ON COLUMN public.orders.sale_origin           IS 'online | manual';
COMMENT ON COLUMN public.orders.manual_payment_method IS 'pix|dinheiro|transferencia|cartao|outro (sale_origin=manual)';
COMMENT ON COLUMN public.orders.manual_payment_note   IS 'Nota interna do produtor sobre o pagamento';
COMMENT ON COLUMN public.orders.manual_sold_by        IS 'Produtor que registrou a venda manual';
COMMENT ON COLUMN public.orders.manual_fee_applied    IS 'Se a taxa foi cobrada na venda manual';
COMMENT ON COLUMN public.orders.customer_cpf          IS 'CPF normalizado (apenas dígitos), usado para lookup recorrente';

CREATE OR REPLACE FUNCTION public.lookup_customer_by_cpf(_event_id uuid, _cpf text)
RETURNS TABLE(name text, email text, whatsapp text, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _norm text := NULLIF(regexp_replace(coalesce(_cpf,''), '\D', '', 'g'), '');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = _event_id AND e.producer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _norm IS NULL OR length(_norm) <> 11 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.nome_completo, p.email, p.whatsapp, 'profile'::text
    FROM public.profiles p
   WHERE p.cpf = _norm
   LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT o.customer_name, o.customer_email, o.customer_phone, 'order'::text
    FROM public.orders o
   WHERE o.customer_cpf = _norm
     AND o.status = 'paid'
   ORDER BY o.created_at DESC
   LIMIT 1;
END $$;

REVOKE ALL ON FUNCTION public.lookup_customer_by_cpf(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_customer_by_cpf(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_manual_order(
  _order_id uuid,
  _actor    uuid,
  _reason   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _order RECORD;
  _used  int;
  _lot   RECORD;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT id, status, sale_origin, coupon_id, event_id
    INTO _order
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = _order.event_id AND e.producer_id = _actor
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _order.sale_origin <> 'manual' THEN
    RAISE EXCEPTION 'not_manual' USING ERRCODE = '22023';
  END IF;

  IF _order.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already_cancelled', true);
  END IF;

  IF _order.status <> 'paid' THEN
    RAISE EXCEPTION 'invalid_status:%', _order.status USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::int INTO _used
    FROM public.tickets
   WHERE order_id = _order_id AND status = 'used';
  IF _used > 0 THEN
    RAISE EXCEPTION 'ticket_already_used' USING ERRCODE = '22023';
  END IF;

  FOR _lot IN
    SELECT lot_id, count(*)::int AS qty
      FROM public.tickets
     WHERE order_id = _order_id
       AND status IN ('valid','pending')
     GROUP BY lot_id
  LOOP
    UPDATE public.event_lots
       SET sold_quantity = GREATEST(0, sold_quantity - _lot.qty)
     WHERE id = _lot.lot_id;
  END LOOP;

  UPDATE public.tickets
     SET status = 'cancelled'
   WHERE order_id = _order_id
     AND status IN ('valid','pending');

  UPDATE public.orders
     SET status = 'cancelled', updated_at = now()
   WHERE id = _order_id;

  IF _order.coupon_id IS NOT NULL THEN
    UPDATE public.event_coupons
       SET uses_count = GREATEST(0, uses_count - 1),
           updated_at = now()
     WHERE id = _order.coupon_id;
  END IF;

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (_actor, 'manual_sale_cancelled', 'order', _order_id,
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('ok', true, 'already_cancelled', false);
END $$;

REVOKE ALL ON FUNCTION public.cancel_manual_order(uuid, uuid, text) FROM PUBLIC;
