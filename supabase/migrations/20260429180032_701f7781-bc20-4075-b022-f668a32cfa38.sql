
-- Tabela de cupons de desconto por evento
CREATE TABLE IF NOT EXISTS public.event_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  valid_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_coupons_event_code_uniq
  ON public.event_coupons (event_id, upper(code));

CREATE INDEX IF NOT EXISTS event_coupons_event_id_idx
  ON public.event_coupons (event_id);

ALTER TABLE public.event_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Produtores podem criar cupons de seus eventos"
ON public.event_coupons FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = event_coupons.event_id AND e.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem atualizar cupons de seus eventos"
ON public.event_coupons FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = event_coupons.event_id AND e.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem deletar cupons de seus eventos"
ON public.event_coupons FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = event_coupons.event_id AND e.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem ver cupons de seus eventos"
ON public.event_coupons FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = event_coupons.event_id AND e.producer_id = auth.uid()
));

CREATE POLICY "Admins podem ver todos os cupons"
ON public.event_coupons FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Cupons ativos podem ser lidos publicamente para validação no checkout
CREATE POLICY "Cupons ativos visíveis publicamente"
ON public.event_coupons FOR SELECT TO anon, authenticated
USING (is_active = true);

-- Trigger updated_at
CREATE TRIGGER update_event_coupons_updated_at
BEFORE UPDATE ON public.event_coupons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Colunas em orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.event_coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
