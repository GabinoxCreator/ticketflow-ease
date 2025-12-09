-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  producer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  date DATE NOT NULL,
  time TIME NOT NULL,
  venue TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT,
  category TEXT NOT NULL,
  image_url TEXT,
  is_hot BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'finished')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create event_lots table
CREATE TABLE public.event_lots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2),
  total_quantity INTEGER NOT NULL,
  sold_quantity INTEGER NOT NULL DEFAULT 0,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_lots ENABLE ROW LEVEL SECURITY;

-- RLS policies for events
CREATE POLICY "Eventos publicados são visíveis para todos"
ON public.events FOR SELECT
USING (status = 'published');

CREATE POLICY "Produtores podem ver seus próprios eventos"
ON public.events FOR SELECT
TO authenticated
USING (producer_id = auth.uid());

CREATE POLICY "Produtores podem criar eventos"
ON public.events FOR INSERT
TO authenticated
WITH CHECK (
  producer_id = auth.uid() AND 
  public.has_role(auth.uid(), 'produtor')
);

CREATE POLICY "Produtores podem atualizar seus eventos"
ON public.events FOR UPDATE
TO authenticated
USING (producer_id = auth.uid())
WITH CHECK (producer_id = auth.uid());

CREATE POLICY "Produtores podem deletar seus eventos"
ON public.events FOR DELETE
TO authenticated
USING (producer_id = auth.uid());

-- RLS policies for event_lots
CREATE POLICY "Lotes de eventos publicados são visíveis"
ON public.event_lots FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events 
    WHERE events.id = event_lots.event_id 
    AND (events.status = 'published' OR events.producer_id = auth.uid())
  )
);

CREATE POLICY "Produtores podem criar lotes"
ON public.event_lots FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events 
    WHERE events.id = event_lots.event_id 
    AND events.producer_id = auth.uid()
  )
);

CREATE POLICY "Produtores podem atualizar lotes"
ON public.event_lots FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events 
    WHERE events.id = event_lots.event_id 
    AND events.producer_id = auth.uid()
  )
);

CREATE POLICY "Produtores podem deletar lotes"
ON public.event_lots FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events 
    WHERE events.id = event_lots.event_id 
    AND events.producer_id = auth.uid()
  )
);

-- Create storage bucket for event images
INSERT INTO storage.buckets (id, name, public) VALUES ('event-images', 'event-images', true);

-- Storage policies
CREATE POLICY "Imagens de eventos são públicas"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-images');

CREATE POLICY "Produtores podem fazer upload de imagens"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-images' AND 
  public.has_role(auth.uid(), 'produtor')
);

CREATE POLICY "Produtores podem atualizar suas imagens"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'event-images');

CREATE POLICY "Produtores podem deletar suas imagens"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-images');

-- Trigger for updated_at
CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();