
-- 1) landing_leads
CREATE TABLE public.landing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cidade text NOT NULL,
  tipo_evento text NOT NULL,
  telefone text NOT NULL,
  status text NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo','contatado','convertido','descartado')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.landing_leads TO authenticated;
GRANT ALL ON public.landing_leads TO service_role;

ALTER TABLE public.landing_leads ENABLE ROW LEVEL SECURITY;

-- 2) has_section (SECURITY DEFINER, no recursion)
CREATE OR REPLACE FUNCTION public.has_section(_user_id uuid, _section text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_section_permissions
    WHERE user_id = _user_id
      AND (section = _section OR section = '_manage_team')
  )
$$;

-- 3) Policies landing_leads
CREATE POLICY "Admins with leads section can view leads"
  ON public.landing_leads
  FOR SELECT
  TO authenticated
  USING (public.has_section(auth.uid(), 'leads'));

CREATE POLICY "Admins with leads section can update leads"
  ON public.landing_leads
  FOR UPDATE
  TO authenticated
  USING (public.has_section(auth.uid(), 'leads'))
  WITH CHECK (public.has_section(auth.uid(), 'leads'));

-- 4) Atualizar CHECK constraint admin_section_permissions para incluir 'leads'
ALTER TABLE public.admin_section_permissions
  DROP CONSTRAINT admin_section_permissions_section_check;

ALTER TABLE public.admin_section_permissions
  ADD CONSTRAINT admin_section_permissions_section_check
  CHECK (section IN (
    'dashboard','produtores','repasses','leads',
    'checklist','saude','configuracoes','_manage_team'
  ));

-- 5) Seed admin primário
DO $$
DECLARE _uid uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE email = 'gabinox54037@gmail.com' LIMIT 1;
  IF _uid IS NOT NULL THEN
    INSERT INTO public.admin_section_permissions (user_id, section)
    VALUES (_uid, 'leads')
    ON CONFLICT (user_id, section) DO NOTHING;
  END IF;
END $$;
