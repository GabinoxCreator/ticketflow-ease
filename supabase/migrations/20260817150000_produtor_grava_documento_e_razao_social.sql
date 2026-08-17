-- ============================================================================
-- Cadastro de produtor: gravar documento, razão social e telefone no lugar certo
-- Data: 17/08/2026
--
-- O PROBLEMA
--   O auto-cadastro de produtor (/area-do-produtor/cadastro) coleta CNPJ e razão
--   social num passo dedicado, mas o trigger só gravava `brand_name` e `email` em
--   `producer_profiles`. O documento ia parar apenas em `profiles.cpf` (campo
--   pessoal) e a razão social se perdia inteira.
--
--   Duas consequências reais:
--     · o painel de admin busca produtor por `producer_profiles.document`
--       (useAdminProdutores.ts) — produtor auto-cadastrado ficava INVISÍVEL ali;
--     · os dados fiscais nasciam vazios, e é deles que sai o contrato/repasse.
--
-- O QUE MUDA
--   Só o bloco `IF _role = 'produtor'`. O resto da função é reproduzido idêntico
--   à versão anterior (20260622223407), inclusive o rebaixamento de 'admin' para
--   'cliente' — que é trava de segurança e não pode se perder numa recriação.
--
-- POR QUE É SEGURA
--   · Cadastro de CLIENTE não passa pelo bloco alterado: caminho intocado.
--   · Só ADIÇÃO de colunas no INSERT que já existia. As três são nullable, então
--     signup antigo (sem `tipo_pessoa` no metadata) continua funcionando e grava
--     NULL em legal_name, exatamente como hoje.
--   · Nenhum backfill, nenhum dado existente é tocado.
--
-- COMO RODAR
--   Colar no SQL Editor do projeto nsrromaqysgoxqvqagdm. Rodar UMA vez.
--   `CREATE OR REPLACE` é idempotente — rodar duas vezes não quebra.
-- ============================================================================

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
  _tipo_pessoa text;
BEGIN
  _cpf_raw := new.raw_user_meta_data ->> 'cpf';
  _cpf_norm := CASE
    WHEN _cpf_raw IS NULL OR _cpf_raw = '' THEN NULL
    ELSE NULLIF(regexp_replace(_cpf_raw, '\D', '', 'g'), '')
  END;

  -- 'pf' | 'pj' — só o wizard de produtor manda. Ausente = cadastro antigo ou de
  -- cliente; nesse caso legal_name fica NULL, que é o comportamento de hoje.
  _tipo_pessoa := lower(coalesce(new.raw_user_meta_data ->> 'tipo_pessoa', ''));

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
  -- (Trava de segurança de 22/06/2026 — não remover numa recriação futura.)
  IF _role = 'admin' THEN
    _role := 'cliente';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, _role);

  IF _role = 'produtor' THEN
    INSERT INTO public.producer_profiles (
      owner_user_id, brand_name, email, document, legal_name, phone
    )
    VALUES (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'nome_completo', 'Minha Organização'),
      new.email,
      -- Mesmo valor normalizado que vai em profiles.cpf: CPF na PF, CNPJ na PJ.
      -- Só dígitos, porque é assim que a busca do painel de admin compara.
      _cpf_norm,
      -- Razão social só faz sentido em PJ. Na PF o campo do formulário é o nome
      -- da pessoa, que já está em brand_name — duplicar aqui só criaria confusão.
      CASE
        WHEN _tipo_pessoa = 'pj'
          THEN NULLIF(new.raw_user_meta_data ->> 'nome_completo', '')
        ELSE NULL
      END,
      NULLIF(new.raw_user_meta_data ->> 'whatsapp', '')
    )
    RETURNING id INTO _pp_id;

    INSERT INTO public.producer_members (producer_profile_id, user_id, role)
    VALUES (_pp_id, new.id, 'owner');
  END IF;

  RETURN new;
END;
$function$;

-- ----------------------------------------------------------------------------
-- ROLLBACK (se precisar voltar): reaplicar a versão de 20260622223407, que é
-- esta mesma função com o INSERT em producer_profiles limitado a
-- (owner_user_id, brand_name, email).
-- ----------------------------------------------------------------------------
