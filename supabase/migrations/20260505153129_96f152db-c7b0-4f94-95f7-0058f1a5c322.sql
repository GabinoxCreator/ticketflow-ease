-- Bloco 3: extensões + índices + RPC legacy
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE INDEX IF NOT EXISTS orders_pending_expiry_idx
  ON public.orders (expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS orders_pending_created_idx
  ON public.orders (created_at)
  WHERE status = 'pending';

-- Decremento seguro de sold_quantity para correção de órfãos pré-Bloco 1.
-- Nunca permite ficar negativo. Retorna true se decrementou, false caso contrário.
CREATE OR REPLACE FUNCTION public.decrement_sold_quantity_legacy(_lot_id uuid, _qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ok int;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;
  UPDATE public.event_lots
     SET sold_quantity = sold_quantity - _qty
   WHERE id = _lot_id
     AND sold_quantity >= _qty;
  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok = 1;
END $$;

REVOKE ALL ON FUNCTION public.decrement_sold_quantity_legacy(uuid, integer) FROM PUBLIC, anon, authenticated;