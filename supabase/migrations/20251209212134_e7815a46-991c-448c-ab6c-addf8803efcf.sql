-- Create collaborators table
CREATE TABLE public.collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  producer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(producer_id, username)
);

-- Create collaborator_events junction table
CREATE TABLE public.collaborator_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(collaborator_id, event_id)
);

-- Enable RLS
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborator_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for collaborators
CREATE POLICY "Produtores podem ver seus colaboradores"
ON public.collaborators
FOR SELECT
USING (producer_id = auth.uid());

CREATE POLICY "Produtores podem criar colaboradores"
ON public.collaborators
FOR INSERT
WITH CHECK (producer_id = auth.uid() AND has_role(auth.uid(), 'produtor'::app_role));

CREATE POLICY "Produtores podem atualizar seus colaboradores"
ON public.collaborators
FOR UPDATE
USING (producer_id = auth.uid());

CREATE POLICY "Produtores podem deletar seus colaboradores"
ON public.collaborators
FOR DELETE
USING (producer_id = auth.uid());

-- RLS Policies for collaborator_events
CREATE POLICY "Produtores podem ver eventos de seus colaboradores"
ON public.collaborator_events
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.collaborators
  WHERE collaborators.id = collaborator_events.collaborator_id
  AND collaborators.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem vincular eventos a colaboradores"
ON public.collaborator_events
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.collaborators
  WHERE collaborators.id = collaborator_events.collaborator_id
  AND collaborators.producer_id = auth.uid()
));

CREATE POLICY "Produtores podem desvincular eventos de colaboradores"
ON public.collaborator_events
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.collaborators
  WHERE collaborators.id = collaborator_events.collaborator_id
  AND collaborators.producer_id = auth.uid()
));

-- Trigger for updated_at
CREATE TRIGGER update_collaborators_updated_at
BEFORE UPDATE ON public.collaborators
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();