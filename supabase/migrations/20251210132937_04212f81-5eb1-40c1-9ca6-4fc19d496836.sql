-- Update handle_new_user function to include CPF
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, nome_completo, whatsapp, email, cpf)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'whatsapp', ''),
    new.email,
    new.raw_user_meta_data ->> 'cpf'
  );
  
  insert into public.user_roles (user_id, role)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'tipo_conta')::app_role, 'cliente')
  );
  
  return new;
end;
$function$;