ALTER TABLE public.event_lots
  ADD COLUMN IF NOT EXISTS manually_sold_out boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.reserve_lot_quantity(_lot_id uuid, _qty integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _ok int;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;
  UPDATE public.event_lots
     SET reserved_quantity = reserved_quantity + _qty
   WHERE id = _lot_id
     AND is_active = true
     AND COALESCE(manually_sold_out, false) = false
     AND (sold_quantity + reserved_quantity + _qty) <= total_quantity;
  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok = 1;
END $function$;