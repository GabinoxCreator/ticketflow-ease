-- ============================================================================
-- O DOCUMENTO DA PRODUTORA DIZ SE A BASE OFICIAL O ENCONTROU NO CADASTRO, OU
-- FICA PENDENTE DE CONFERÊNCIA PELA CASA (OS-338)
-- 28/10/2026 · achado da OS-322 (27/10, Mesa/Entrada.md)
-- Número depois da 20261026220000 (OS-317) e da 20261026233000 (OS-322, ainda
-- no galho fix/os322-quem-e-a-pessoa): não toca nenhuma das duas. Não muda
-- `profiles` nem o `handle_new_user`.
-- ============================================================================
--
-- POR QUE
--   O cadastro de produtor confere o CPF/CNPJ na base oficial (consulta do
--   Marcel, edge `document-lookup`): documento que a base não acha trava o
--   "Continuar". Mas quem chama o cadastro direto pela chave pública do
--   Supabase (auth/v1/signup com tipo_conta 'produtor') pula a tela, e o
--   `handle_new_user` grava em `producer_profiles.document` qualquer coisa que
--   vier: documento inventado, número com dígito errado, ou o CPF/CNPJ de outra
--   conta da FestPag. Nada no banco sabia se aquele documento passou pela
--   conferência. A mesma coisa vale para a produtora criada direto na tabela
--   pela regra "Producers can create organization".
--
-- O QUE ISTO NÃO PROVA (revisão 1, 28/10)
--   'base_oficial' quer dizer que a base oficial ENCONTROU o documento (ele
--   existe), não que ele é de quem está se cadastrando: a consulta é pública,
--   então quem chama direto pode consultar o CPF/CNPJ de outra pessoa e usar a
--   ficha. Ser dono do documento continua sendo conferência da casa (decisão 27
--   em Mesa/Decisões esperando.md). Por isso a tela da casa diz "Documento
--   encontrado na base oficial", nunca "conferido".
--
-- O QUE FAZ
--   1. Ficha de conferência: quando a base oficial ACHA o documento, a edge
--      `document-lookup` grava uma ficha (`conferencias_de_documento`) e devolve
--      o número dela para a tela; a tela manda esse número no cadastro
--      (metadata `conferencia_documento`). A ficha guarda o sha256 dos
--      dígitos SEM segredo: serve só para casar com o cadastro e NÃO esconde o
--      documento de quem lê a tabela (CPF se desfaz por força bruta). Quem
--      protege é a tabela fechada (nem a chave pública nem o navegador leem) e a
--      vida curta da ficha: vale 2 horas, serve uma vez só e some depois de 1
--      dia. Só a edge grava (função liberada só para service_role).
--   2. Duas colunas novas em `producer_profiles`:
--        documento_conferencia     'base_oficial' · 'pendente' · 'casa' · null
--        documento_conferencia_em  quando ficou assim
--      null = produtora criada antes desta migration ser aplicada, ou sem
--      documento (não se afirma nada sobre elas: as de hoje ficam como estão).
--   3. Gatilho ao CRIAR a produtora (qualquer caminho: handle_new_user ou
--      gravação direta): documento com dígito errado NÃO entra (fica sem
--      documento, como quem não preencheu, e vai para a auditoria); documento
--      com a ficha certa (mesmo documento, dentro das 2 horas, não usada) e que
--      não é de outra conta = 'base_oficial'; qualquer outro caso = 'pendente'
--      (sem ficha, ficha vencida ou de outro documento, ou documento que já é o
--      CPF/CNPJ de OUTRA conta ou de produtora de outro dono), com o motivo na
--      auditoria (só os 3 últimos dígitos). A conta e a produtora nascem SEMPRE:
--      se algo der errado no gatilho, a produtora nasce como hoje, 'pendente'.
--   4. Gatilho ao MUDAR: o documento trocado (pela tela com PIN, ou pela casa)
--      volta a 'pendente' (nenhuma das duas consulta a base). Só a casa (admin
--      logado, função da casa ou SQL) muda a conferência à mão: produtor pelo
--      navegador é recusado (`conferencia_so_pela_casa`, 42501).
--
-- O QUE NÃO MUDA
--   O cadastro de cliente (o `handle_new_user` não é tocado; o gatilho novo é
--   na tabela das produtoras, que cliente não cria). A conta de produtor nasce
--   igual, com o mesmo documento de hoje (só o de dígito errado deixa de
--   entrar). Venda, painel, repasse e a regra do repasse (06 e 07/10: CPF/CNPJ
--   da produtora com dígito certo e titular da conta) não mudam: 'pendente' não
--   trava nada sozinho, é o aviso para a casa conferir antes de pagar.
--
-- ORDEM DE SUBIDA: em qualquer ordem, e podem ir separados.
--   · Migration antes da edge e do publish: toda produtora nova fica
--     'pendente' até a edge e a tela subirem (nada trava; só o aviso).
--   · Edge antes da migration: a chamada da ficha dá erro, a edge segue sem ela
--     e responde como hoje.
--   · Publish antes: a tela só manda a ficha quando a edge devolve uma.
--
-- A CASA CONFERE À MÃO (SQL, ou admin logado):
--   update public.producer_profiles set documento_conferencia = 'casa'
--    where id = '<produtora>';
--
-- COMO VOLTAR ATRÁS: bloco "VOLTAR ATRÁS" comentado no fim deste arquivo.
-- ============================================================================

-- O ALTER TABLE em producer_profiles pede trava exclusiva: se a tabela estiver
-- presa por mais de 3 s, a migration desiste em vez de enfileirar o site.
-- `local`: vale só dentro da transação da migration (mesmo jeito das migrations
-- da gestão 20261017130000 e 20261017150000).
set local lock_timeout = '3s';


-- ── 1. A ficha de conferência ─────────────────────────────────────────────────
create table if not exists public.conferencias_de_documento (
  id             uuid primary key default gen_random_uuid(),
  documento_hash text not null,                 -- sha256 (hex) dos dígitos, sem segredo: casa com o cadastro, não esconde o documento
  criada_em      timestamptz not null default now(),
  usada_em       timestamptz,
  usada_por      uuid
);
create index if not exists conferencias_de_documento_criada_em_idx
  on public.conferencias_de_documento (criada_em);

-- Ninguém de fora lê nem escreve: sem regra de RLS e sem permissão para o
-- navegador (o Supabase dá permissão padrão a anon e authenticated em tabela
-- nova do public; tirada aqui).
alter table public.conferencias_de_documento enable row level security;
revoke all on table public.conferencias_de_documento from public, anon, authenticated;

comment on table public.conferencias_de_documento is
  'OS-338: ficha que a edge document-lookup grava quando a base oficial acha o CPF/CNPJ. O cadastro de produtor usa uma vez, em até 2 horas; some depois de 1 dia. Guarda o sha256 sem segredo (não esconde o documento de quem lê a tabela): só a casa e a chave de serviço leem.';


create or replace function public.registrar_conferencia_de_documento(_documento text)
returns uuid
language plpgsql
security definer
set search_path = public
as $rc$
DECLARE
  _d  text := regexp_replace(coalesce(_documento, ''), '[^0-9]', '', 'g');
  _id uuid;
BEGIN
  IF NOT public.documento_valido(_d) THEN
    RETURN NULL;
  END IF;

  -- Limpeza: ficha com mais de 1 dia não serve para nada.
  DELETE FROM public.conferencias_de_documento WHERE criada_em < now() - interval '1 day';

  INSERT INTO public.conferencias_de_documento (documento_hash)
  VALUES (encode(sha256(convert_to(_d, 'UTF8')), 'hex'))
  RETURNING id INTO _id;

  RETURN _id;
END;
$rc$;

-- Só a edge (chave de serviço). Sem isso, qualquer um gravaria a ficha de
-- qualquer documento sem passar pela base oficial.
revoke all on function public.registrar_conferencia_de_documento(text) from public, anon, authenticated;
grant execute on function public.registrar_conferencia_de_documento(text) to service_role;


-- ── 2. As colunas ─────────────────────────────────────────────────────────────
alter table public.producer_profiles
  add column if not exists documento_conferencia    text,
  add column if not exists documento_conferencia_em timestamptz;

do $chk$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.producer_profiles'::regclass
                    and conname = 'producer_profiles_documento_conferencia_valores') then
    alter table public.producer_profiles
      add constraint producer_profiles_documento_conferencia_valores
      check (documento_conferencia is null
             or documento_conferencia in ('base_oficial', 'pendente', 'casa'));
  end if;
end
$chk$;

comment on column public.producer_profiles.documento_conferencia is
  'OS-338: base_oficial = a base oficial ENCONTROU o documento no cadastro (ficha da document-lookup; não prova que é de quem se cadastrou); pendente = entrou sem essa conferência (chamada direta, ficha vencida, documento de outra conta, ou documento trocado depois); casa = a casa conferiu à mão; null = produtora criada antes desta migration ser aplicada, ou sem documento.';


-- ── 3. Ao criar a produtora ───────────────────────────────────────────────────
-- SECURITY DEFINER: lê o metadata do cadastro em auth.users e usa a ficha, as
-- duas coisas fora do alcance do navegador. Não precisa saber quem grava: o
-- resultado sai sempre do dado, e o que o navegador mandar nas duas colunas é
-- ignorado.
create or replace function public._produtora_documento_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $pc$
DECLARE
  _doc     text := nullif(regexp_replace(coalesce(NEW.document, ''), '[^0-9]', '', 'g'), '');
  _ficha   text;
  _id      uuid;
  _usada   uuid;
  _motivo  text;
BEGIN
  NEW.documento_conferencia    := NULL;
  NEW.documento_conferencia_em := NULL;

  IF _doc IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- Dígito errado (ou tamanho que não é CPF nem CNPJ): não entra.
    IF NOT public.documento_valido(_doc) THEN
      NEW.document := NULL;
      INSERT INTO public.audit_logs (actor_id, target_type, target_id, action, metadata)
      VALUES (NEW.owner_user_id, 'producer_profile', NEW.id, 'documento_produtora_recusado',
              jsonb_build_object('motivo', 'digito_errado', 'final', right(_doc, 3)));
      RETURN NEW;
    END IF;

    -- A ficha que a tela mandou no cadastro (chamada direta não tem).
    SELECT u.raw_user_meta_data ->> 'conferencia_documento'
      INTO _ficha
      FROM auth.users u
     WHERE u.id = NEW.owner_user_id;

    IF _ficha ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      _id := _ficha::uuid;
      UPDATE public.conferencias_de_documento c
         SET usada_em = now(), usada_por = NEW.owner_user_id
       WHERE c.id = _id
         AND c.documento_hash = encode(sha256(convert_to(_doc, 'UTF8')), 'hex')
         AND c.usada_em IS NULL
         AND c.criada_em > now() - interval '2 hours'
      RETURNING c.id INTO _usada;
    END IF;

    -- O documento já é de OUTRA conta (perfil de outra pessoa) ou de produtora
    -- de outro dono: a base oficial diz que o documento existe, não que é de
    -- quem está se cadastrando. Fica para a casa olhar.
    IF EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.cpf = _doc AND p.id <> NEW.owner_user_id)
       OR EXISTS (SELECT 1 FROM public.producer_profiles o
                   WHERE o.owner_user_id <> NEW.owner_user_id
                     AND regexp_replace(coalesce(o.document, ''), '[^0-9]', '', 'g') = _doc) THEN
      _motivo := 'documento_em_outra_conta';
    ELSIF _usada IS NULL THEN
      _motivo := CASE WHEN _id IS NULL THEN 'sem_conferencia' ELSE 'conferencia_nao_vale' END;
    END IF;

    IF _motivo IS NULL THEN
      NEW.documento_conferencia := 'base_oficial';
    ELSE
      NEW.documento_conferencia := 'pendente';
      INSERT INTO public.audit_logs (actor_id, target_type, target_id, action, metadata)
      VALUES (NEW.owner_user_id, 'producer_profile', NEW.id, 'documento_produtora_pendente',
              jsonb_build_object('motivo', _motivo, 'final', right(_doc, 3)));
    END IF;
    NEW.documento_conferencia_em := now();

  EXCEPTION WHEN OTHERS THEN
    -- A conta e a produtora nascem SEMPRE (é o cadastro de produtor): sem a
    -- conferência, o documento fica como veio e 'pendente'.
    RAISE WARNING 'OS-338: conferencia do documento da produtora % nao rodou: %', NEW.id, SQLERRM;
    NEW.documento_conferencia    := 'pendente';
    NEW.documento_conferencia_em := now();
  END;

  RETURN NEW;
END;
$pc$;

revoke all on function public._produtora_documento_no_cadastro() from public, anon, authenticated;

drop trigger if exists producer_profiles_conferencia_no_cadastro on public.producer_profiles;
create trigger producer_profiles_conferencia_no_cadastro
  before insert on public.producer_profiles
  for each row execute function public._produtora_documento_no_cadastro();


-- ── 4. Ao mudar ───────────────────────────────────────────────────────────────
-- Sem SECURITY DEFINER de propósito (mesmo jeito do _documento_so_com_pin):
-- current_user é quem está gravando. Função da casa (definer) roda como
-- postgres; edge com a chave de serviço, como service_role.
create or replace function public._produtora_documento_na_troca()
returns trigger
language plpgsql
set search_path = public
as $pt$
DECLARE
  _navegador  boolean := current_user IN ('anon', 'authenticated');
  _doc_novo   text := nullif(regexp_replace(coalesce(NEW.document, ''), '[^0-9]', '', 'g'), '');
  _doc_velho  text := nullif(regexp_replace(coalesce(OLD.document, ''), '[^0-9]', '', 'g'), '');
  _mexeu      boolean := NEW.documento_conferencia IS DISTINCT FROM OLD.documento_conferencia
                      OR NEW.documento_conferencia_em IS DISTINCT FROM OLD.documento_conferencia_em;
BEGIN
  IF _mexeu AND _navegador AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'conferencia_so_pela_casa'
      USING ERRCODE = '42501',
            HINT = 'A conferência do documento da produtora só muda pela casa (OS-338).';
  END IF;

  IF _doc_novo IS DISTINCT FROM _doc_velho AND NOT _mexeu THEN
    -- Documento trocado sem consulta à base: volta a pendente de conferência.
    NEW.documento_conferencia    := CASE WHEN _doc_novo IS NULL THEN NULL ELSE 'pendente' END;
    NEW.documento_conferencia_em := CASE WHEN _doc_novo IS NULL THEN NULL ELSE now() END;
  ELSIF NEW.documento_conferencia IS DISTINCT FROM OLD.documento_conferencia
        AND NEW.documento_conferencia_em IS NOT DISTINCT FROM OLD.documento_conferencia_em THEN
    -- A casa marcou à mão sem dizer quando: agora.
    NEW.documento_conferencia_em := CASE WHEN NEW.documento_conferencia IS NULL THEN NULL ELSE now() END;
  END IF;

  RETURN NEW;
END;
$pt$;

revoke all on function public._produtora_documento_na_troca() from public, anon, authenticated;

drop trigger if exists producer_profiles_conferencia_na_troca on public.producer_profiles;
create trigger producer_profiles_conferencia_na_troca
  before update of document, documento_conferencia, documento_conferencia_em on public.producer_profiles
  for each row execute function public._produtora_documento_na_troca();


-- ============================================================================
-- VOLTAR ATRÁS (não roda; copiar e rodar à mão se precisar)
-- ----------------------------------------------------------------------------
-- drop trigger if exists producer_profiles_conferencia_na_troca on public.producer_profiles;
-- drop trigger if exists producer_profiles_conferencia_no_cadastro on public.producer_profiles;
-- drop function if exists public._produtora_documento_na_troca();
-- drop function if exists public._produtora_documento_no_cadastro();
-- drop function if exists public.registrar_conferencia_de_documento(text);
-- drop table if exists public.conferencias_de_documento;
-- alter table public.producer_profiles drop constraint if exists producer_profiles_documento_conferencia_valores;
-- alter table public.producer_profiles drop column if exists documento_conferencia_em,
--                                      drop column if exists documento_conferencia;
-- (A edge nova sem a função segue igual à de hoje; a tela nova sem a edge nova
--  não manda a ficha. As duas podem ficar.)
-- ============================================================================
