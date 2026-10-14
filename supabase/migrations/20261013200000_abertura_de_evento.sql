-- OS-221 (13/10/2026): o link de abertura de evento.
--
-- Fechou um evento, a FestPag gera um link (/abrir-evento/<código>) e manda ao produtor.
-- Ele responde uma pergunta por tela, sem login e sem nada obrigatório (o que fica para
-- trás leva um motivo). A conta e o evento em RASCUNHO, com os lotes, a equipe cria pelo
-- botão do admin: nunca publica sozinho.
--
-- Peças:
--   tabela   aberturas_evento            (uma por link; respostas e pendências em jsonb)
--   cofre    aberturas-evento            (logo e arte; envio liberado só a quem tem código válido)
--   anon     abertura_ler · abertura_salvar · abertura_enviar
--   admin    abertura_criar_rascunho     (evento draft + lotes + taxa combinada)
--
-- Como voltar atrás (nada aqui mexe no que já existia; evento já criado pelo botão fica):
--   drop function if exists public.abertura_criar_rascunho(uuid, uuid), public._abertura_instante(text, text, text),
--     public.abertura_enviar(text), public.abertura_salvar(text, jsonb, jsonb, smallint),
--     public.abertura_ler(text);
--   drop policy if exists "Abertura envia arquivo com codigo valido" on storage.objects;
--   drop function if exists public.abertura_token_valido(text);
--   drop table if exists public.aberturas_evento;
--   (o cofre 'aberturas-evento' pode ficar: sem a regra acima, ninguém envia nada)

-- ============================================================
-- Tabela
-- ============================================================
create table if not exists public.aberturas_evento (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  cliente text not null,                                  -- como o link cumprimenta ("Fogo & Fumaça")
  taxa_percent numeric(5,2) not null default 10 check (taxa_percent >= 0 and taxa_percent <= 30),
  nota_interna text,
  respostas jsonb not null default '{}'::jsonb,
  pendencias jsonb not null default '{}'::jsonb,          -- { "<pergunta>": "<motivo>" }
  etapa_atual smallint not null default 0,
  enviada_em timestamptz,
  ultima_edicao_em timestamptz,
  producer_profile_id uuid references public.producer_profiles(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  rascunho_criado_em timestamptz,
  criada_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_aberturas_evento_created on public.aberturas_evento (created_at desc);

drop trigger if exists update_aberturas_evento_updated_at on public.aberturas_evento;
create trigger update_aberturas_evento_updated_at
  before update on public.aberturas_evento
  for each row execute function public.update_updated_at_column();

alter table public.aberturas_evento enable row level security;

drop policy if exists "Admins gerenciam aberturas" on public.aberturas_evento;
create policy "Admins gerenciam aberturas"
  on public.aberturas_evento for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- Cofre de arquivos: logo e arte que o produtor manda pelo link
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aberturas-evento', 'aberturas-evento', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- O código vale enquanto o rascunho não foi criado.
create or replace function public.abertura_token_valido(_token text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.aberturas_evento
    where token = _token and event_id is null
  )
$$;
revoke all on function public.abertura_token_valido(text) from public;
grant execute on function public.abertura_token_valido(text) to anon, authenticated;

drop policy if exists "Abertura envia arquivo com codigo valido" on storage.objects;
create policy "Abertura envia arquivo com codigo valido"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'aberturas-evento'
    and public.abertura_token_valido((storage.foldername(name))[1])
  );

-- ============================================================
-- O link (anon): ler, salvar, enviar
-- ============================================================
create or replace function public.abertura_ler(_token text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'cliente', a.cliente,
    'taxa_percent', a.taxa_percent,
    'respostas', a.respostas,
    'pendencias', a.pendencias,
    'etapa_atual', a.etapa_atual,
    'enviada_em', a.enviada_em,
    'rascunho_criado', a.event_id is not null
  )
  from public.aberturas_evento a
  where a.token = _token
$$;
revoke all on function public.abertura_ler(text) from public;
grant execute on function public.abertura_ler(text) to anon, authenticated;

create or replace function public.abertura_salvar(
  _token text, _respostas jsonb, _pendencias jsonb, _etapa smallint
)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  if _respostas is null or jsonb_typeof(_respostas) <> 'object'
     or _pendencias is null or jsonb_typeof(_pendencias) <> 'object' then
    raise exception 'formato_invalido';
  end if;
  -- trava de tamanho: o formulário inteiro cabe com folga em 100 KB
  if pg_column_size(_respostas) + pg_column_size(_pendencias) > 100000 then
    raise exception 'grande_demais';
  end if;

  update public.aberturas_evento
     set respostas = _respostas,
         pendencias = _pendencias,
         etapa_atual = greatest(0, least(coalesce(_etapa, etapa_atual), 20)),
         ultima_edicao_em = now()
   where token = _token and event_id is null;

  if not found then
    if exists (select 1 from public.aberturas_evento where token = _token) then
      raise exception 'ja_criado';
    end if;
    raise exception 'link_invalido';
  end if;
end $$;
revoke all on function public.abertura_salvar(text, jsonb, jsonb, smallint) from public;
grant execute on function public.abertura_salvar(text, jsonb, jsonb, smallint) to anon, authenticated;

create or replace function public.abertura_enviar(_token text)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  update public.aberturas_evento
     set enviada_em = coalesce(enviada_em, now()), ultima_edicao_em = now()
   where token = _token;
  if not found then raise exception 'link_invalido'; end if;
end $$;
revoke all on function public.abertura_enviar(text) from public;
grant execute on function public.abertura_enviar(text) to anon, authenticated;

-- ============================================================
-- Admin: criar o evento em rascunho com os lotes
-- ============================================================
-- Data e hora "de parede" em São Paulo viram instante (igual ao front: spWallToInstant).
create or replace function public._abertura_instante(_data text, _hora text, _padrao text)
returns timestamptz
language sql immutable set search_path = public
as $$
  select case
    when coalesce(_data, '') ~ '^\d{4}-\d{2}-\d{2}$'
      then ((_data || ' ' || coalesce(nullif(_hora, ''), _padrao))::timestamp at time zone 'America/Sao_Paulo')
    else null
  end
$$;
revoke all on function public._abertura_instante(text, text, text) from public;

create or replace function public.abertura_criar_rascunho(_abertura_id uuid, _producer_profile_id uuid default null)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  a public.aberturas_evento%rowtype;
  _perfil uuid;
  _dono uuid;
  r jsonb;
  _evento uuid;
  _lote jsonb;
  _novo uuid;
  _ids jsonb := '{}'::jsonb;    -- id local do formulário -> id do lote no banco
  _anterior text;
  _data_ini date;
  _hora_ini time;
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'so_admin';
  end if;

  select * into a from public.aberturas_evento where id = _abertura_id for update;
  if not found then raise exception 'abertura_nao_existe'; end if;
  if a.event_id is not null then return a.event_id; end if;

  _perfil := coalesce(_producer_profile_id, a.producer_profile_id);
  if _perfil is null then raise exception 'sem_produtor'; end if;
  select owner_user_id into _dono from public.producer_profiles where id = _perfil;
  if _dono is null then raise exception 'produtor_nao_existe'; end if;

  r := a.respostas;

  -- Sem data o evento não existe no banco (date e time são obrigatórios). Hora vazia = 00:00.
  _data_ini := nullif(r #>> '{local,data_inicio}', '')::date;
  if _data_ini is null then raise exception 'falta_data'; end if;
  _hora_ini := coalesce(nullif(r #>> '{local,hora_inicio}', ''), '00:00')::time;

  insert into public.events (
    producer_id, producer_profile_id, title, description, date, time, end_date, end_time,
    venue, city, state, address, category, image_url, status, is_public, event_type
  ) values (
    _dono, _perfil,
    coalesce(nullif(trim(r #>> '{evento,titulo}'), ''), a.cliente),
    nullif(trim(concat_ws(E'\n\n',
      nullif(trim(r #>> '{evento,descricao}'), ''),
      case when nullif(trim(r #>> '{evento,classificacao}'), '') is not null
           then 'Classificação: ' || trim(r #>> '{evento,classificacao}') end
    )), ''),
    _data_ini, _hora_ini,
    nullif(r #>> '{local,data_fim}', '')::date,
    nullif(r #>> '{local,hora_fim}', '')::time,
    coalesce(nullif(trim(r #>> '{local,local}'), ''), 'A definir'),
    coalesce(nullif(trim(r #>> '{local,cidade}'), ''), 'A definir'),
    coalesce(nullif(upper(trim(r #>> '{local,uf}')), ''), 'SP'),
    nullif(trim(r #>> '{local,endereco}'), ''),
    coalesce(nullif(r #>> '{evento,categoria}', ''), 'outros'),
    nullif(r #>> '{arte,imagem_url}', ''),
    'draft',
    coalesce((r #>> '{evento,publico}')::boolean, true),
    'ingresso'
  ) returning id into _evento;

  -- Lotes: primeira passada insere, segunda resolve o "abre quando o anterior esgotar".
  for _lote in select * from jsonb_array_elements(coalesce(r #> '{ingressos,lotes}', '[]'::jsonb)) loop
    if nullif(trim(_lote ->> 'nome'), '') is null then continue; end if;
    insert into public.event_lots (
      event_id, name, price, total_quantity, is_active, sector_name,
      sales_start_type, start_date, end_date
    ) values (
      _evento,
      trim(_lote ->> 'nome'),
      -- o formulário manda o preço já convertido em `preco_valor` (o `preco` é o texto digitado)
      greatest(coalesce(nullif(_lote ->> 'preco_valor', '')::numeric, 0), 0),
      greatest(coalesce(nullif(regexp_replace(coalesce(_lote ->> 'quantidade', ''), '\D', '', 'g'), '')::int, 1), 1),
      true,
      coalesce(nullif(trim(_lote ->> 'setor'), ''), 'Ingressos'),
      case when _lote ->> 'inicio' in ('now','scheduled','after_lot') then _lote ->> 'inicio' else 'now' end,
      case when _lote ->> 'inicio' = 'scheduled'
           then public._abertura_instante(_lote ->> 'inicio_data', _lote ->> 'inicio_hora', '00:00') end,
      public._abertura_instante(_lote ->> 'fim_data', _lote ->> 'fim_hora', '23:59:59')
    ) returning id into _novo;
    _ids := _ids || jsonb_build_object(coalesce(_lote ->> 'id', _novo::text), _novo);
  end loop;

  _anterior := null;
  for _lote in select * from jsonb_array_elements(coalesce(r #> '{ingressos,lotes}', '[]'::jsonb)) loop
    if nullif(trim(_lote ->> 'nome'), '') is null then continue; end if;
    if _lote ->> 'inicio' = 'after_lot' and _anterior is not null then
      update public.event_lots set starts_after_lot_id = (_ids ->> _anterior)::uuid
       where id = (_ids ->> (_lote ->> 'id'))::uuid;
    end if;
    _anterior := _lote ->> 'id';
  end loop;

  -- A taxa combinada no link vale para PIX e cartão deste evento.
  if a.taxa_percent <> 10 then
    insert into public.event_fee_overrides (event_id, payment_method, fee_percent, fee_fixed, notes, created_by)
    values (_evento, 'pix', a.taxa_percent, 0, 'Taxa combinada no link de abertura', auth.uid()),
           (_evento, 'card', a.taxa_percent, 0, 'Taxa combinada no link de abertura', auth.uid())
    on conflict (event_id, payment_method) do nothing;
  end if;

  update public.aberturas_evento
     set event_id = _evento, producer_profile_id = _perfil, rascunho_criado_em = now()
   where id = a.id;

  return _evento;
end $$;
revoke all on function public.abertura_criar_rascunho(uuid, uuid) from public;
grant execute on function public.abertura_criar_rascunho(uuid, uuid) to authenticated;
