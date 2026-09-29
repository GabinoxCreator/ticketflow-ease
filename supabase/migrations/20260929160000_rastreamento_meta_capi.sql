-- ============================================================================
-- Rastreamento da Meta: consentimento no perfil, token da API de Conversões
-- por produtor, e o gatilho que manda a COMPRA do servidor para a Meta.
--
-- Por que (29/09/2026, caso Luana / Filhos da Luz): o pixel do navegador nunca
-- mandou evento de compra, e o que o navegador manda se perde em bloqueador de
-- anúncio, iPhone e na volta da tela de pagamento. A API de Conversões manda do
-- NOSSO servidor, que não perde. Mas o servidor não enxerga o localStorage —
-- por isso o consentimento do titular passa a morar no perfil.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Consentimento de marketing do TITULAR (LGPD art. 7º, IX / art. 8º)
--    Mesmo padrão do facial_consent_at: decisão + data + versão do texto.
--    Guardar só no localStorage era prova fraca e o servidor não alcançava.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists marketing_consent boolean,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists marketing_consent_version text,
  add column if not exists fbp text,
  add column if not exists fbc text;

comment on column public.profiles.marketing_consent is
  'LGPD: opt-in do banner de cookies para marketing (Pixel/Meta). NULL = ainda não decidiu. false = recusou -> nada é enviado à Meta.';
comment on column public.profiles.fbp is
  'Identificador de navegador escrito pelo próprio Pixel (_fbp). Só é gravado com marketing_consent = true; revogação apaga.';
comment on column public.profiles.fbc is
  'Identificador do clique no anúncio (_fbc). Só é gravado com marketing_consent = true; revogação apaga.';

-- ---------------------------------------------------------------------------
-- 2) Token da API de Conversões, um por produtor.
--    Tabela separada de propósito: RLS sem policy nenhuma + grants revogados =
--    NINGUÉM lê pelo PostgREST, nem o próprio dono. Só o service role (edge).
--    O painel do produtor escreve por RPC e só consegue perguntar SE existe.
-- ---------------------------------------------------------------------------
create table if not exists public.producer_tracking_secrets (
  producer_profile_id uuid primary key
    references public.producer_profiles(id) on delete cascade,
  meta_capi_token text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.producer_tracking_secrets enable row level security;
-- Sem CREATE POLICY: RLS ligada e sem policy nega tudo para anon/authenticated.
revoke all on table public.producer_tracking_secrets from anon, authenticated, public;

comment on table public.producer_tracking_secrets is
  'Token da API de Conversões da Meta, por produtor. Fechado: só o service role lê. Escrita via set_meta_capi_token().';

-- Grava (ou apaga, se vier vazio) o token do produtor. Só o dono do perfil.
create or replace function public.set_meta_capi_token(_producer_profile_id uuid, _token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _dono uuid;
begin
  select owner_user_id into _dono
    from public.producer_profiles
   where id = _producer_profile_id;

  if _dono is null or _dono is distinct from auth.uid() then
    raise exception 'sem permissão para este produtor';
  end if;

  if _token is null or btrim(_token) = '' then
    delete from public.producer_tracking_secrets
     where producer_profile_id = _producer_profile_id;
    return;
  end if;

  insert into public.producer_tracking_secrets
    (producer_profile_id, meta_capi_token, updated_at, updated_by)
  values (_producer_profile_id, btrim(_token), now(), auth.uid())
  on conflict (producer_profile_id) do update
    set meta_capi_token = excluded.meta_capi_token,
        updated_at      = now(),
        updated_by      = auth.uid();
end;
$$;

-- Responde só SIM ou NÃO — o token nunca volta para o navegador.
create or replace function public.has_meta_capi_token(_producer_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _dono uuid;
begin
  select owner_user_id into _dono
    from public.producer_profiles
   where id = _producer_profile_id;

  if _dono is null or _dono is distinct from auth.uid() then
    return false;
  end if;

  return exists (
    select 1 from public.producer_tracking_secrets
     where producer_profile_id = _producer_profile_id
       and coalesce(btrim(meta_capi_token), '') <> ''
  );
end;
$$;

-- ⚠️ CREATE FUNCTION dá EXECUTE ao PUBLIC por padrão. Revogar SEMPRE antes de
-- conceder (lição de event_seats: DROP+CREATE devolve o execute ao public).
revoke execute on function public.set_meta_capi_token(uuid, text) from public, anon;
revoke execute on function public.has_meta_capi_token(uuid)       from public, anon;
grant  execute on function public.set_meta_capi_token(uuid, text) to authenticated;
grant  execute on function public.has_meta_capi_token(uuid)       to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Registro dos envios — é a prova de que a compra chegou na Meta, e é o que
--    impede mandar duas vezes. Nada de dado pessoal aqui dentro.
-- ---------------------------------------------------------------------------
create table if not exists public.meta_capi_envios (
  order_id    uuid primary key references public.orders(id) on delete cascade,
  pixel_id    text,
  sucesso     boolean not null,
  motivo      text,
  resposta    jsonb,
  enviado_em  timestamptz not null default now()
);

alter table public.meta_capi_envios enable row level security;
revoke all on table public.meta_capi_envios from anon, authenticated, public;

comment on table public.meta_capi_envios is
  'Uma linha por pedido enviado (ou recusado) para a API de Conversões da Meta. Sem dado pessoal: só id do pedido, pixel, motivo e a resposta da Meta.';

-- ---------------------------------------------------------------------------
-- 4) O gatilho. Mesmo padrão do trg_payouts_aviso: segredo do Vault + pg_net.
--    Só venda ONLINE conta — cortesia, maquininha e venda manual não vieram de
--    anúncio nenhum e sujariam a medição da campanha.
-- ---------------------------------------------------------------------------
create or replace function public.enviar_compra_para_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _segredo text;
begin
  if new.status <> 'paid' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'paid' then return new; end if;
  if coalesce(new.sale_origin, 'online') <> 'online' then return new; end if;

  select decrypted_secret into _segredo
    from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;

  if _segredo is null then
    raise warning '[META-CAPI] CRON_SECRET nao encontrado no Vault; compra % nao foi enviada', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/meta-capi-purchase',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', _segredo
               ),
    body    := jsonb_build_object('order_id', new.id, 'origem', 'gatilho'),
    timeout_milliseconds := 25000
  );

  return new;
exception when others then
  -- Rastreamento NUNCA pode atrapalhar a venda.
  raise warning '[META-CAPI] gatilho falhou para o pedido %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_orders_meta_capi on public.orders;
create trigger trg_orders_meta_capi
  after insert or update of status on public.orders
  for each row execute function public.enviar_compra_para_meta();
