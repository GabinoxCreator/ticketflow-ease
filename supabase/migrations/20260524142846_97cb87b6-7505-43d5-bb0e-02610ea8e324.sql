
CREATE TABLE public.event_fee_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('pix','card')),
  fee_percent numeric NOT NULL DEFAULT 10,
  fee_fixed numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, payment_method)
);

CREATE INDEX idx_event_fee_overrides_event ON public.event_fee_overrides(event_id);

ALTER TABLE public.event_fee_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view fee overrides"
  ON public.event_fee_overrides FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert fee overrides"
  ON public.event_fee_overrides FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update fee overrides"
  ON public.event_fee_overrides FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete fee overrides"
  ON public.event_fee_overrides FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_event_fee_overrides_updated_at
  BEFORE UPDATE ON public.event_fee_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_event_fee(_event_id uuid, _method text)
RETURNS TABLE(fee_percent numeric, fee_fixed numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT o.fee_percent FROM public.event_fee_overrides o
              WHERE o.event_id = _event_id AND o.payment_method = _method), 10)::numeric AS fee_percent,
    COALESCE((SELECT o.fee_fixed FROM public.event_fee_overrides o
              WHERE o.event_id = _event_id AND o.payment_method = _method), 0)::numeric AS fee_fixed;
$$;
