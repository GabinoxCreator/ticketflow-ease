-- Coluna de reserva no lote
ALTER TABLE public.event_lots
  ADD COLUMN IF NOT EXISTS reserved_quantity integer NOT NULL DEFAULT 0;

-- Constraint não-negativa
ALTER TABLE public.event_lots
  DROP CONSTRAINT IF EXISTS event_lots_reserved_nonneg;
ALTER TABLE public.event_lots
  ADD CONSTRAINT event_lots_reserved_nonneg CHECK (reserved_quantity >= 0) NOT VALID;
ALTER TABLE public.event_lots
  VALIDATE CONSTRAINT event_lots_reserved_nonneg;

-- Expiração do pedido
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Índice para futuro cron de cleanup
CREATE INDEX IF NOT EXISTS idx_orders_status_expires
  ON public.orders (status, expires_at)
  WHERE status = 'pending';

COMMENT ON COLUMN public.orders.status IS
  'pending | paid | completed | cancelled | refunded | failed';

-- RPC: reservar
CREATE OR REPLACE FUNCTION public.reserve_lot_quantity(_lot_id uuid, _qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ok int;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;
  UPDATE public.event_lots
     SET reserved_quantity = reserved_quantity + _qty
   WHERE id = _lot_id
     AND is_active = true
     AND (sold_quantity + reserved_quantity + _qty) <= total_quantity;
  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok = 1;
END $$;

-- RPC: liberar
CREATE OR REPLACE FUNCTION public.release_lot_quantity(_lot_id uuid, _qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _qty <= 0 THEN RETURN true; END IF;
  UPDATE public.event_lots
     SET reserved_quantity = GREATEST(0, reserved_quantity - _qty)
   WHERE id = _lot_id;
  RETURN true;
END $$;

-- RPC: confirmar venda (com guarda atômica)
CREATE OR REPLACE FUNCTION public.confirm_lot_sale(_lot_id uuid, _qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ok int;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;
  UPDATE public.event_lots
     SET reserved_quantity = reserved_quantity - _qty,
         sold_quantity     = sold_quantity + _qty
   WHERE id = _lot_id
     AND reserved_quantity >= _qty;
  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok = 1;
END $$;

-- Permissões: apenas service_role pode chamar
REVOKE ALL ON FUNCTION public.reserve_lot_quantity(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_lot_quantity(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_lot_sale(uuid, integer)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_lot_quantity(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_lot_quantity(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_lot_sale(uuid, integer)     TO service_role;