-- Segurança (privilege escalation, buraco 1, passo B): handle_new_user para de honrar
-- tipo_conta='admin' vindo do metadata do signup.
--
-- Antes, _role vinha direto de raw_user_meta_data->>'tipo_conta' e 'admin' é um valor
-- válido de app_role — então um signup self-service com options.data.tipo_conta='admin'
-- gravava role admin (SECURITY DEFINER, bypassando o RLS). Agora, se vier 'admin', a
-- função REBAIXA pra 'cliente'. 'cliente' e 'produtor' seguem normais.
--
-- Admin legítimo é concedido só pela edge admin-invite-collaborator (service-role), que
-- desde o passo A faz o INSERT do role por conta própria — não depende mais deste trigger.
--
-- Recriação idêntica à versão anterior (20260507150809), mudando APENAS o bloco do _role.

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

  -- 'admin' NUNCA é concedido por signup self-service: rebaixa pra 'cliente'.
  IF _role = 'admin' THEN
    _role := 'cliente';
  END IF;

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
