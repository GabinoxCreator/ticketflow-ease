-- ============================================================================
-- Conta de cliente por CPF, senha + código pelo WhatsApp ou e-mail — BLOCO 0 (fundação)
-- Data: 09/09/2026 · Plano: _docs/plano-login-cpf-whatsapp.md
--
-- DESENHO (decidido em 09/09 com o Gabriel): toda conta tem SENHA, e todo login
-- pede senha + um código de 6 dígitos que chega pelo WhatsApp ou pelo e-mail.
-- O código é NOSSO (esta tabela + edges), não do Supabase — o projeto é Lovable
-- Cloud, sem painel de autenticação para configurar provedor de telefone ou
-- ganchos. Tudo o que o login precisa mora no repositório e neste banco.
--
-- O QUE ESTA MIGRATION FAZ (e o que NÃO faz)
--   1. `events.auth_flow`: a chave que liga o caminho novo POR EVENTO. Nasce 'v1'
--      em todo evento — a Oktoberfest continua no cadastro/login de hoje. Só o
--      evento marcado 'v2' (a Porcada, quando o Bloco 1 estiver provado) vê o novo.
--   2. `profiles`: três colunas novas, todas NULL para todo mundo. Nada muda.
--   3. `auth_codigos`: onde vivem os códigos (só o hash), com validade, contagem
--      de tentativas e queima. Ninguém lê pela API — só as edges (service role).
--   4. `handle_new_user`: aprende a criar o perfil de uma conta SEM e-mail de
--      verdade. Quem só tem WhatsApp recebe no Supabase um e-mail interno
--      (`<cpf>@sem-email.festpag.digital`, marcado por `sem_email` no metadata);
--      o perfil grava e-mail VAZIO, para nenhum envio ir parar lá. O caminho de
--      hoje é reproduzido idêntico — inclusive o rebaixamento de 'admin' para
--      'cliente' (trava de 22/06/2026) e o bloco de produtor de 17/08/2026.
--   5. `normalizar_whatsapp(text)`: função IMMUTABLE que transforma qualquer
--      jeito de escrever o número em "55DDDNÚMERO", e um índice por ela em
--      `profiles`. NÃO reescreve o dado existente — a leitura é que normaliza.
--   6. `ler_segredo(nome)`: RPC que só o service role executa, para as edges
--      lerem do Vault a configuração do WhatsApp (mesmo padrão do push da gestão).
--
--   NÃO cria unicidade de CPF. Há 14 CPFs com mais de uma conta hoje (medido em
--   09/09), e cinco delas são contas de PRODUTOR abertas pelo próprio Gabriel
--   com o CPF dele. A regra "um CPF, uma conta de cliente" vale no caminho novo
--   (edge `auth-identificar`, Bloco 1), não no banco.
--
-- COMO VOLTAR ATRÁS
--   Reaplicar a `handle_new_user` de 20260817150000 e rodar o bloco ROLLBACK no
--   fim deste arquivo. Nenhuma linha existente é alterada por esta migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A chave por evento
-- ----------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS auth_flow text NOT NULL DEFAULT 'v1';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_auth_flow_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_auth_flow_check CHECK (auth_flow IN ('v1', 'v2'));

COMMENT ON COLUMN public.events.auth_flow IS
  'v1 = cadastro/login de hoje (e-mail + senha). v2 = conta por CPF, senha + código no WhatsApp/e-mail (plano de 09/09/2026). Padrão v1 até a virada.';

-- ----------------------------------------------------------------------------
-- 2. Perfil: carimbos de canal confirmado e preferência
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS email_confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS canal_preferido text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_canal_preferido_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_canal_preferido_check
  CHECK (canal_preferido IS NULL OR canal_preferido IN ('whatsapp', 'email', 'ambos'));

COMMENT ON COLUMN public.profiles.whatsapp_confirmado_em IS
  'Quando a pessoa provou o WhatsApp com um código. NULL = nunca provou; o ingresso NÃO vai por WhatsApp.';
COMMENT ON COLUMN public.profiles.email_confirmado_em IS
  'Quando a pessoa provou o e-mail com um código de LOGIN (a confirmação de cadastro está desligada; email_confirmed_at do auth não prova nada).';
COMMENT ON COLUMN public.profiles.canal_preferido IS
  'Onde a pessoa pediu para receber código e ingresso: whatsapp | email | ambos. NULL = comportamento de hoje (e-mail).';

-- ----------------------------------------------------------------------------
-- 3. Os códigos de acesso (cadastro, login e confirmação de canal)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_codigos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposito     text NOT NULL CHECK (proposito IN ('cadastro', 'login', 'canal')),
  canal         text NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  destino       text NOT NULL,                 -- "55DDDNÚMERO" ou e-mail em minúsculas
  cpf           text,                          -- só dígitos, quando o fluxo é por CPF
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo_hash   text NOT NULL,                 -- sha256(id || ':' || código); o código em si nunca é gravado
  tentativas    integer NOT NULL DEFAULT 0,
  expira_em     timestamptz NOT NULL,
  usado_em      timestamptz,                   -- conferido com sucesso OU queimado por excesso de tentativas
  ip            text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.auth_codigos IS
  'Códigos de 6 dígitos do login por CPF/WhatsApp/e-mail (plano 09/09/2026). Só o service role lê e escreve. Guarda o hash, nunca o código.';

CREATE INDEX IF NOT EXISTS idx_auth_codigos_destino_aberto
  ON public.auth_codigos (destino, proposito)
  WHERE usado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_codigos_limpeza
  ON public.auth_codigos (expira_em);

-- RLS ligada e SEM política: pela API pública ninguém lê nem escreve.
ALTER TABLE public.auth_codigos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_codigos FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. handle_new_user: aceita conta sem e-mail de verdade
--    (idêntica à de 20260817150000 fora das linhas marcadas com "-- v2")
-- ----------------------------------------------------------------------------
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
  _sem_email boolean;                                               -- v2
  _email text;                                                      -- v2
BEGIN
  _cpf_raw := new.raw_user_meta_data ->> 'cpf';
  _cpf_norm := CASE
    WHEN _cpf_raw IS NULL OR _cpf_raw = '' THEN NULL
    ELSE NULLIF(regexp_replace(_cpf_raw, '\D', '', 'g'), '')
  END;

  -- 'pf' | 'pj' — só o wizard de produtor manda. Ausente = cadastro antigo ou de
  -- cliente; nesse caso legal_name fica NULL, que é o comportamento de hoje.
  _tipo_pessoa := lower(coalesce(new.raw_user_meta_data ->> 'tipo_pessoa', ''));

  -- v2: conta criada só com WhatsApp. O Supabase exige um e-mail, então ela
  -- recebe um interno (<cpf>@sem-email.festpag.digital) e o metadata marca
  -- `sem_email`. No perfil o e-mail fica VAZIO — nenhum envio vai para lá.
  _sem_email := coalesce(new.raw_user_meta_data ->> 'sem_email', '') IN ('true', '1');
  _email := CASE WHEN _sem_email THEN '' ELSE coalesce(new.email, '') END;

  INSERT INTO public.profiles (id, nome_completo, whatsapp, email, cpf)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'whatsapp', ''),
    _email,                                                         -- v2
    _cpf_norm
  );

  _role := coalesce((new.raw_user_meta_data ->> 'tipo_conta')::app_role, 'cliente');

  -- 'admin' NUNCA é concedido por signup self-service: rebaixa pra 'cliente'.
  -- (Trava de segurança de 22/06/2026 — não remover numa recriação futura.)
  IF _role = 'admin' THEN
    _role := 'cliente';
  END IF;

  -- v2: produtor continua exigindo e-mail de verdade (decisão do Gabriel, 09/09).
  IF _role = 'produtor' AND (_sem_email OR new.email IS NULL) THEN
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
-- 5. Número de WhatsApp em um formato só (leitura), sem reescrever o dado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalizar_whatsapp(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  -- "(17) 99999-9999", "+55 17 99999 9999", "5517999999999" → "5517999999999".
  -- Devolve NULL quando não dá para reconhecer um número brasileiro.
  SELECT CASE
    WHEN d IS NULL OR d = '' THEN NULL
    WHEN length(d) IN (10, 11) THEN '55' || d
    WHEN length(d) IN (12, 13) AND d LIKE '55%' THEN d
    ELSE NULL
  END
  FROM (SELECT regexp_replace(_raw, '\D', '', 'g') AS d) s;
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_normalizado
  ON public.profiles (public.normalizar_whatsapp(whatsapp))
  WHERE public.normalizar_whatsapp(whatsapp) IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 6. Segredos do Vault para as edges (só service role)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ler_segredo(_nome text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = _nome LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.ler_segredo(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ler_segredo(text) TO service_role;

-- ----------------------------------------------------------------------------
-- ROLLBACK (não roda sozinho — colar à mão se precisar voltar)
-- ----------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.ler_segredo(text);
-- DROP INDEX IF EXISTS public.idx_profiles_whatsapp_normalizado;
-- DROP FUNCTION IF EXISTS public.normalizar_whatsapp(text);
-- DROP TABLE IF EXISTS public.auth_codigos;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS whatsapp_confirmado_em,
--   DROP COLUMN IF EXISTS email_confirmado_em, DROP COLUMN IF EXISTS canal_preferido;
-- ALTER TABLE public.events DROP COLUMN IF EXISTS auth_flow;
-- (e reaplicar handle_new_user de 20260817150000)
