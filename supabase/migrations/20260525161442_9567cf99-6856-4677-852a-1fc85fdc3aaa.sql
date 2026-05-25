ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mp_status_detail text;
COMMENT ON COLUMN public.orders.mp_status_detail IS 'status_detail retornado pelo MP — útil pra debug de rejeições do antifraude';
CREATE INDEX IF NOT EXISTS idx_orders_mp_status_detail ON public.orders(mp_status_detail) WHERE mp_status_detail IS NOT NULL;