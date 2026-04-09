
-- =============================================
-- Table: checkin_logs
-- =============================================
CREATE TABLE public.checkin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  operator_id UUID,
  collaborator_id UUID,
  action TEXT NOT NULL DEFAULT 'checkin',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.checkin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Producers can view checkin logs"
  ON public.checkin_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = checkin_logs.event_id
        AND (events.producer_id = auth.uid()
          OR (events.producer_profile_id IS NOT NULL AND is_producer_member(auth.uid(), events.producer_profile_id)))
    )
  );

CREATE POLICY "Producers can insert checkin logs"
  ON public.checkin_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = checkin_logs.event_id
        AND (events.producer_id = auth.uid()
          OR (events.producer_profile_id IS NOT NULL AND is_producer_member(auth.uid(), events.producer_profile_id)))
    )
  );

CREATE INDEX idx_checkin_logs_ticket ON public.checkin_logs(ticket_id);
CREATE INDEX idx_checkin_logs_event ON public.checkin_logs(event_id);

-- =============================================
-- Table: door_sales
-- =============================================
CREATE TABLE public.door_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES public.event_lots(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'dinheiro',
  notes TEXT,
  operator_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.door_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Producers can view door sales"
  ON public.door_sales FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = door_sales.event_id
        AND (events.producer_id = auth.uid()
          OR (events.producer_profile_id IS NOT NULL AND is_producer_member(auth.uid(), events.producer_profile_id)))
    )
  );

CREATE POLICY "Producers can insert door sales"
  ON public.door_sales FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = door_sales.event_id
        AND (events.producer_id = auth.uid()
          OR (events.producer_profile_id IS NOT NULL AND is_producer_member(auth.uid(), events.producer_profile_id)))
    )
  );

CREATE INDEX idx_door_sales_event ON public.door_sales(event_id);

-- Trigger to auto-increment sold_quantity on event_lots when door sale is inserted
CREATE OR REPLACE FUNCTION public.handle_door_sale_lot_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.event_lots
  SET sold_quantity = sold_quantity + NEW.quantity
  WHERE id = NEW.lot_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_door_sale_insert
  AFTER INSERT ON public.door_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_door_sale_lot_update();
