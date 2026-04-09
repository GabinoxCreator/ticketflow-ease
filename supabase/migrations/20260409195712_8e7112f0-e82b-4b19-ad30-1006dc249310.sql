
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
  _pp_id uuid;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, nome_completo, whatsapp, email, cpf)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'whatsapp', ''),
    new.email,
    new.raw_user_meta_data ->> 'cpf'
  );
  
  -- Determine role
  _role := coalesce((new.raw_user_meta_data ->> 'tipo_conta')::app_role, 'cliente');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, _role);
  
  -- Auto-create producer_profile + owner member for producers
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
