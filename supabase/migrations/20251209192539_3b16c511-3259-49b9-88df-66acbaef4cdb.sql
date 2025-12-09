-- Drop existing restrictive SELECT policies
DROP POLICY IF EXISTS "Eventos publicados são visíveis para todos" ON public.events;
DROP POLICY IF EXISTS "Produtores podem ver seus próprios eventos" ON public.events;

-- Recreate as PERMISSIVE policies (OR logic instead of AND)
CREATE POLICY "Eventos publicados são visíveis para todos" 
ON public.events 
FOR SELECT 
TO public
USING (status = 'published');

CREATE POLICY "Produtores podem ver seus próprios eventos" 
ON public.events 
FOR SELECT 
TO authenticated
USING (producer_id = auth.uid());