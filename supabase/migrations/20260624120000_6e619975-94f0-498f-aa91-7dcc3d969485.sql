-- Permite sale_origin = 'smartpos' (venda de balcão via maquininha / SmartPOS).
-- Aditivo: mantém online/manual/courtesy e adiciona 'smartpos'. Espelha 20260525182559.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_sale_origin_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_sale_origin_check
  CHECK (sale_origin = ANY (ARRAY['online'::text, 'manual'::text, 'courtesy'::text, 'smartpos'::text]));
