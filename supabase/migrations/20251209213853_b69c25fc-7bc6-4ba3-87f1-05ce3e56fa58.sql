-- Create guest_lists table
CREATE TABLE public.guest_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  valid_until_time TIME NOT NULL,
  public_slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_guests INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create guest_list_entries table
CREATE TABLE public.guest_list_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_list_id UUID NOT NULL REFERENCES public.guest_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  added_by TEXT NOT NULL DEFAULT 'producer',
  status TEXT NOT NULL DEFAULT 'pending',
  checked_in_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.guest_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_list_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for guest_lists
CREATE POLICY "Produtores podem ver listas de seus eventos"
ON public.guest_lists FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id = guest_lists.event_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem criar listas para seus eventos"
ON public.guest_lists FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id = guest_lists.event_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem atualizar listas de seus eventos"
ON public.guest_lists FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id = guest_lists.event_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem deletar listas de seus eventos"
ON public.guest_lists FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id = guest_lists.event_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Listas ativas são visíveis publicamente"
ON public.guest_lists FOR SELECT
USING (is_active = true);

-- RLS policies for guest_list_entries
CREATE POLICY "Produtores podem ver entradas de suas listas"
ON public.guest_list_entries FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.guest_lists
  JOIN public.events ON events.id = guest_lists.event_id
  WHERE guest_lists.id = guest_list_entries.guest_list_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem criar entradas em suas listas"
ON public.guest_list_entries FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.guest_lists
  JOIN public.events ON events.id = guest_lists.event_id
  WHERE guest_lists.id = guest_list_entries.guest_list_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem atualizar entradas de suas listas"
ON public.guest_list_entries FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.guest_lists
  JOIN public.events ON events.id = guest_lists.event_id
  WHERE guest_lists.id = guest_list_entries.guest_list_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem deletar entradas de suas listas"
ON public.guest_list_entries FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.guest_lists
  JOIN public.events ON events.id = guest_lists.event_id
  WHERE guest_lists.id = guest_list_entries.guest_list_id
  AND events.producer_id = auth.uid()
));

CREATE POLICY "Sistema pode inserir entradas publicamente"
ON public.guest_list_entries FOR INSERT
WITH CHECK (added_by = 'public');

-- Trigger for updated_at
CREATE TRIGGER update_guest_lists_updated_at
BEFORE UPDATE ON public.guest_lists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster slug lookups
CREATE INDEX idx_guest_lists_public_slug ON public.guest_lists(public_slug);