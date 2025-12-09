-- Create orders table for purchases
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  payment_method TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tickets table for individual tickets
CREATE TABLE public.tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES public.event_lots(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  holder_name TEXT NOT NULL,
  holder_email TEXT,
  holder_phone TEXT,
  ticket_code TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'cancelled')),
  validated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for orders
CREATE POLICY "Produtores podem ver pedidos de seus eventos"
ON public.orders
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id = orders.event_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Clientes podem ver seus próprios pedidos"
ON public.orders
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Produtores podem atualizar pedidos de seus eventos"
ON public.orders
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id = orders.event_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Sistema pode criar pedidos"
ON public.orders
FOR INSERT
WITH CHECK (true);

-- RLS Policies for tickets
CREATE POLICY "Produtores podem ver ingressos de seus eventos"
ON public.tickets
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id = tickets.event_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Clientes podem ver seus próprios ingressos"
ON public.tickets
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Produtores podem atualizar ingressos de seus eventos"
ON public.tickets
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id = tickets.event_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Sistema pode criar ingressos"
ON public.tickets
FOR INSERT
WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_orders_event_id ON public.orders(event_id);
CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_tickets_event_id ON public.tickets(event_id);
CREATE INDEX idx_tickets_order_id ON public.tickets(order_id);
CREATE INDEX idx_tickets_lot_id ON public.tickets(lot_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_ticket_code ON public.tickets(ticket_code);