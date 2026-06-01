-- Tabela de permissões por seção para colaboradores admin da FestPag
CREATE TABLE public.admin_section_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, section),
  CHECK (section IN ('dashboard','produtores','repasses','checklist','saude','configuracoes','_manage_team'))
);

GRANT SELECT, INSERT, DELETE ON public.admin_section_permissions TO authenticated;
GRANT ALL ON public.admin_section_permissions TO service_role;

ALTER TABLE public.admin_section_permissions ENABLE ROW LEVEL SECURITY;

-- Função SECURITY DEFINER para checar gestor sem disparar RLS da própria tabela
CREATE OR REPLACE FUNCTION public.has_manage_team(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_section_permissions
     WHERE user_id = _user_id AND section = '_manage_team'
  )
$$;

-- Policies
CREATE POLICY "Admins can read permissions"
ON public.admin_section_permissions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only managers can insert permissions"
ON public.admin_section_permissions
FOR INSERT
TO authenticated
WITH CHECK (public.has_manage_team(auth.uid()));

CREATE POLICY "Only managers can delete permissions"
ON public.admin_section_permissions
FOR DELETE
TO authenticated
USING (public.has_manage_team(auth.uid()));

-- Trigger: bloqueia auto-remoção e remoção do último gestor
CREATE OR REPLACE FUNCTION public.guard_admin_section_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _remaining int;
BEGIN
  IF OLD.section = '_manage_team' THEN
    IF OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'cannot_remove_own_manage_team'
        USING HINT = 'Você não pode remover seu próprio acesso de gestor.';
    END IF;
    SELECT count(*) INTO _remaining
      FROM public.admin_section_permissions
     WHERE section = '_manage_team'
       AND user_id <> OLD.user_id;
    IF _remaining = 0 THEN
      RAISE EXCEPTION 'cannot_remove_last_manage_team'
        USING HINT = 'Não é possível remover o último gestor de equipe. Promova outro colaborador a gestor antes.';
    END IF;
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_guard_admin_section_delete
BEFORE DELETE ON public.admin_section_permissions
FOR EACH ROW EXECUTE FUNCTION public.guard_admin_section_delete();

-- Seed do admin primário (não falha se email não existir)
DO $$
DECLARE _uid uuid;
        _section text;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE email = 'gabinox54037@gmail.com' LIMIT 1;
  IF _uid IS NOT NULL THEN
    FOREACH _section IN ARRAY ARRAY['dashboard','produtores','repasses','checklist','saude','configuracoes','_manage_team']
    LOOP
      INSERT INTO public.admin_section_permissions (user_id, section)
      VALUES (_uid, _section)
      ON CONFLICT (user_id, section) DO NOTHING;
    END LOOP;
  ELSE
    RAISE NOTICE 'Admin primário gabinox54037@gmail.com não encontrado em auth.users. Rode manualmente: INSERT INTO public.admin_section_permissions (user_id, section) SELECT id, s FROM auth.users CROSS JOIN unnest(ARRAY[''dashboard'',''produtores'',''repasses'',''checklist'',''saude'',''configuracoes'',''_manage_team'']) AS s WHERE email=''gabinox54037@gmail.com'' ON CONFLICT DO NOTHING;';
  END IF;
END $$;