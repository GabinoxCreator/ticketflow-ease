
-- Drop policies antigas do bucket event-images
DROP POLICY IF EXISTS "Imagens de eventos são públicas" ON storage.objects;
DROP POLICY IF EXISTS "Produtores podem atualizar suas imagens" ON storage.objects;
DROP POLICY IF EXISTS "Produtores podem deletar suas imagens" ON storage.objects;
DROP POLICY IF EXISTS "Produtores podem fazer upload de imagens" ON storage.objects;

-- SELECT público (bucket é público)
CREATE POLICY "event-images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-images');

-- INSERT: admin, produtor, ou membro ativo de organização produtora
CREATE POLICY "event-images authorized insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-images'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'produtor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.producer_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
);

-- UPDATE: mesma regra
CREATE POLICY "event-images authorized update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'produtor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.producer_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
)
WITH CHECK (
  bucket_id = 'event-images'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'produtor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.producer_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
);

-- DELETE: mesma regra
CREATE POLICY "event-images authorized delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'produtor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.producer_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
);
