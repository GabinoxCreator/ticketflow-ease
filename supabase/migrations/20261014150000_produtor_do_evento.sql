-- Contato do produtor na página do evento (14/10/2026).
--
-- O cartão "Realização" da página do evento lia `producer_profiles` pelo embed
-- de `events`, mas a tabela tem RLS fechada para anônimos: quem não estava
-- logado (quase todo comprador) recebia null e o cartão nem aparecia. Mesmo
-- caminho da `get_event_tracking`: função pública que devolve SÓ o que é para
-- o comprador ver (nome, logo, WhatsApp e e-mail de contato). Documento, razão
-- social, taxa e pixel continuam fechados.
--
-- Como voltar atrás: DROP FUNCTION public.produtor_do_evento(uuid);

CREATE OR REPLACE FUNCTION public.produtor_do_evento(_event_id uuid)
RETURNS TABLE (brand_name text, logo_url text, email text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pp.brand_name, pp.logo_url, pp.email, pp.phone
    FROM public.events e
    JOIN public.producer_profiles pp ON pp.id = e.producer_profile_id
   WHERE e.id = _event_id;
$$;

REVOKE ALL ON FUNCTION public.produtor_do_evento(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.produtor_do_evento(uuid) TO anon, authenticated;
