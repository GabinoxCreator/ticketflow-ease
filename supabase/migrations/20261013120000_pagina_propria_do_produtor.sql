-- ============================================================================
-- PÁGINA PRÓPRIA DO PRODUTOR: festpag.digital/<nome-dele>
-- 13/10/2026 · OS-219
-- ============================================================================
--
-- POR QUE
--   Pedido do Guilherme para a Disgracera Cultural: um endereço do produtor
--   com todos os eventos dele, como na Sympla. Vale para todo produtor.
--   Regra do Gabriel (13/10): "o nome do produtor deve ser o /nome dele.
--   Exemplo: Filhos da Luz Produções: festpag.digital/filhosdaluzproducoes".
--   O endereço sai SOZINHO do nome da produtora: tudo junto, minúsculo, sem
--   acento, sem espaço e sem pontuação. E o produtor pode trocar o dele nas
--   Configurações (decisão do Gabriel na caixinha, 13/10).
--
-- O QUE FAZ
--   1. `slug_de_texto`: a regra do nome ("Filhos da Luz Produções" vira
--      "filhosdaluzproducoes").
--   2. Lista de palavras que são caminhos do próprio site (login, evento,
--      ajuda...): nenhum produtor fica com elas.
--   3. `gerar_slug_produtor`: aplica a regra e, se o nome já é de outra
--      produtora (ou é palavra do site), põe número no fim: festpagdigital2.
--   4. Gatilho em `producer_profiles`: produtora nova nasce com endereço; o
--      produtor que troca o dele passa pela mesma régua; apagar o campo volta
--      ao automático. Trocar o NOME da produtora não muda o endereço (link já
--      divulgado não pode quebrar).
--   5. Preenche o endereço de quem já existe (a mais antiga fica sem número).
--   6. `produtor_publico`: a página pública lê marca e logo por aqui. A
--      tabela segue fechada para visitante (tem CPF/CNPJ, e-mail e telefone).
--
-- O QUE NÃO MUDA
--   Nenhuma tela existente, nenhum pedido, nenhum evento. A página do evento
--   continua igual.
--
-- COMO VOLTAR ATRÁS
--   DROP TRIGGER producer_profiles_slug ON public.producer_profiles;
--   ALTER TABLE public.producer_profiles DROP CONSTRAINT producer_profiles_slug_formato;
--   DROP FUNCTION public.produtor_publico(text),
--                 public.endereco_produtor_livre(text, uuid),
--                 public._producer_profiles_slug(),
--                 public.gerar_slug_produtor(text, uuid),
--                 public.slug_produtor_reservado(text),
--                 public.slug_de_texto(text);
--   (opcional) UPDATE public.producer_profiles SET slug = NULL;
--   O índice único `producer_profiles_slug_key` já existia antes: fica.
-- ============================================================================

-- 1. A regra do nome ---------------------------------------------------------
-- translate em vez de unaccent: é imutável e não depende de search_path.
CREATE OR REPLACE FUNCTION public.slug_de_texto(_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT left(
    regexp_replace(
      translate(
        lower(coalesce(_texto, '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'
      ),
      '[^a-z0-9]', '', 'g'
    ),
    60
  )
$$;

-- 2. Palavras que são caminhos do site ---------------------------------------
-- Os caminhos do site têm hífen (meus-ingressos) e o endereço do produtor não;
-- a versão sem hífen entra na lista mesmo assim, para não confundir ninguém.
CREATE OR REPLACE FUNCTION public.slug_produtor_reservado(_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _slug = ANY (ARRAY[
    'admin','ajuda','api','app','apresentacao','areadoprodutor','auth',
    'cadastro','checkout','colaborador','conta','contato','criarevento',
    'dashboard','editarevento','entrar','evento','eventos',
    'ingresso','ingressos','lista','login','lp','lp2',
    'meusingressos','minhaconta','pedido','pedidos','privacidade','produtor',
    'produtores','reembolso','resetpassword','sair','sobre','suporte','taxa',
    'termos','transferencia'
  ])
$$;

-- 3. Gerar o endereço a partir do nome ---------------------------------------
CREATE OR REPLACE FUNCTION public.gerar_slug_produtor(_nome text, _id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text := public.slug_de_texto(_nome);
  cand text;
  n int := 1;
BEGIN
  -- Nome sem letra nem número (ou curto demais) ainda precisa de endereço.
  IF length(base) < 3 THEN
    base := left('produtor' || base, 60);
  END IF;
  cand := base;
  WHILE public.slug_produtor_reservado(cand)
     OR EXISTS (SELECT 1 FROM public.producer_profiles p
                 WHERE p.slug = cand AND p.id IS DISTINCT FROM _id) LOOP
    n := n + 1;
    cand := left(base, 60 - length(n::text)) || n::text;
  END LOOP;
  RETURN cand;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_slug_produtor(text, uuid) FROM PUBLIC, anon, authenticated;

-- 4. Gatilho -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._producer_profiles_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.slug IS NOT DISTINCT FROM OLD.slug THEN
    RETURN NEW;
  END IF;

  -- Vazio: o endereço sai do nome da produtora.
  IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    NEW.slug := public.gerar_slug_produtor(NEW.brand_name, NEW.id);
    RETURN NEW;
  END IF;

  -- O produtor escolheu: mesma régua, sem número automático (ele vê o recado).
  NEW.slug := public.slug_de_texto(NEW.slug);
  IF length(NEW.slug) < 3 THEN
    RAISE EXCEPTION 'O endereço precisa ter pelo menos 3 letras ou números.'
      USING ERRCODE = 'P0001';
  END IF;
  IF public.slug_produtor_reservado(NEW.slug) THEN
    RAISE EXCEPTION 'Esse endereço é usado pelo próprio site. Escolha outro.'
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.producer_profiles p
              WHERE p.slug = NEW.slug AND p.id <> NEW.id) THEN
    RAISE EXCEPTION 'Esse endereço já é de outra produtora. Escolha outro.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS producer_profiles_slug ON public.producer_profiles;
CREATE TRIGGER producer_profiles_slug
  BEFORE INSERT OR UPDATE OF slug ON public.producer_profiles
  FOR EACH ROW EXECUTE FUNCTION public._producer_profiles_slug();

-- 5. Preencher quem já existe (a mais antiga fica com o nome sem número) -----
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, brand_name FROM public.producer_profiles
            WHERE slug IS NULL OR btrim(slug) = ''
            ORDER BY created_at, id LOOP
    UPDATE public.producer_profiles
       SET slug = public.gerar_slug_produtor(r.brand_name, r.id)
     WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.producer_profiles
  ADD CONSTRAINT producer_profiles_slug_formato CHECK (slug ~ '^[a-z0-9]{3,60}$');

COMMENT ON COLUMN public.producer_profiles.slug IS
  'Endereço público da produtora: festpag.digital/<slug>. Nasce do nome (gatilho producer_profiles_slug); o produtor pode trocar. Trocar o nome NÃO muda o endereço. OS-219, 13/10/2026.';

-- 6. O que a tela de Configurações pergunta antes de salvar ------------------
-- 'ok' · 'curto' · 'reservado' · 'ocupado'. Só diz se está livre; não revela
-- de quem é.
CREATE OR REPLACE FUNCTION public.endereco_produtor_livre(_slug text, _producer_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (SELECT public.slug_de_texto(_slug) AS v)
  SELECT CASE
    WHEN length(s.v) < 3 THEN 'curto'
    WHEN public.slug_produtor_reservado(s.v) THEN 'reservado'
    WHEN EXISTS (SELECT 1 FROM public.producer_profiles p
                  WHERE p.slug = s.v AND p.id IS DISTINCT FROM _producer_profile_id) THEN 'ocupado'
    ELSE 'ok'
  END
  FROM s
$$;

REVOKE ALL ON FUNCTION public.endereco_produtor_livre(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.endereco_produtor_livre(text, uuid) TO authenticated;

-- 7. A página pública lê a produtora por aqui --------------------------------
-- Só o que já aparece em "Realização": nome e logo. Produtora bloqueada pela
-- casa não tem página.
CREATE OR REPLACE FUNCTION public.produtor_publico(_slug text)
RETURNS TABLE (id uuid, brand_name text, logo_url text, slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.brand_name, p.logo_url, p.slug
    FROM public.producer_profiles p
   WHERE p.slug = lower(btrim(_slug))
     AND p.status = 'active'
     AND p.admin_status = 'active'
$$;

REVOKE ALL ON FUNCTION public.produtor_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.produtor_publico(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.slug_de_texto(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.slug_de_texto(text) TO authenticated;
