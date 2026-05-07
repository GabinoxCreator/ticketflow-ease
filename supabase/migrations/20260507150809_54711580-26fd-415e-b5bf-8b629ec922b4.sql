-- Normalize existing CPFs to digits-only
UPDATE public.profiles
SET cpf = regexp_replace(cpf, '\D', '', 'g')
WHERE cpf IS NOT NULL AND cpf <> regexp_replace(cpf, '\D', '', 'g');

-- Convert empty string CPFs to NULL for clarity
UPDATE public.profiles SET cpf = NULL WHERE cpf = '';

-- Update handle_new_user to normalize CPF (digits only) on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
  _pp_id uuid;
  _cpf_raw text;
  _cpf_norm text;
BEGIN
  _cpf_raw := new.raw_user_meta_data ->> 'cpf';
  _cpf_norm := CASE
    WHEN _cpf_raw IS NULL OR _cpf_raw = '' THEN NULL
    ELSE NULLIF(regexp_replace(_cpf_raw, '\D', '', 'g'), '')
  END;

  INSERT INTO public.profiles (id, nome_completo, whatsapp, email, cpf)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'whatsapp', ''),
    new.email,
    _cpf_norm
  );

  _role := coalesce((new.raw_user_meta_data ->> 'tipo_conta')::app_role, 'cliente');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, _role);

  IF _role = 'produtor' THEN
    INSERT INTO public.producer_profiles (owner_user_id, brand_name, email)
    VALUES (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'nome_completo', 'Minha Organização'),
      new.email
    )
    RETURNING id INTO _pp_id;

    INSERT INTO public.producer_members (producer_profile_id, user_id, role)
    VALUES (_pp_id, new.id, 'owner');
  END IF;

  RETURN new;
END;
$function$;