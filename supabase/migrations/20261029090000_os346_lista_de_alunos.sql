-- ============================================================================
-- LISTA DE ALUNOS POR EVENTO E A TRAVA DA COMPRA DE POLTRONA (OS-346)
-- 28/10/2026 · Balé da Bruna ("Alice através da Dança", 17/12, duas sessões)
-- Número depois da 20261028010000 (OS-338). Não toca nada das OS-317, 322, 338.
-- ============================================================================
--
-- POR QUE
--   A escola só vende os convites para as famílias dos alunos: ninguém compra
--   sem o CPF e a data de nascimento de uma criança da lista, cada criança tem
--   4 convites somando as duas sessões, e a venda abre em dois lotes (decisões
--   do Gabriel de 14/10, 15/10 e 28/10, ficha da OS-346). Nada disso existia:
--   o limite que havia era por CPF de quem compra, e só no ingresso de lote.
--
-- O QUE FAZ
--   1. Tabelas novas, todas FECHADAS (RLS ligada e sem regra; nem a chave
--      pública nem o navegador leem ou gravam; só funções e service_role):
--        listas_alunos          a lista (limite por aluno, abertura dos lotes,
--                               a chave da trava, a data de apagar os dados)
--        listas_alunos_eventos  quais eventos (sessões) usam a lista
--        alunos_lista           as crianças: nome, CPF, nascimento, e se dança
--                               nas duas sessões (= 2º lote) ou em uma (1º lote)
--        alunos_passes          o "passe" que a conferência entrega ao navegador
--                               (3 horas, preso à conta): o navegador guarda o
--                               passe, nunca o CPF nem o nascimento da criança
--        alunos_reservas        qual criança segurou cada reserva de poltrona
--        alunos_pedidos         qual criança cada pedido usou (o CPF da criança
--                               NÃO é copiado para o pedido: só o vínculo)
--   2. Funções novas:
--        evento_lista_info(evento)       pública, sem dado de pessoa: se o
--                                        evento tem lista, os horários e as
--                                        sessões
--        aluno_conferir(evento, cpf, nasc) conta logada: confere a criança,
--                                        devolve só o primeiro nome, quantos
--                                        convites restam e o passe. Errou: conta
--                                        a tentativa (8 por conta em 15 min, 12
--                                        por CPF em 1 hora) e não diz se o CPF
--                                        existe na lista
--        aluno_pelo_passe(passe)         conta logada: a mesma resposta pelo
--                                        passe (a tela atualiza o que resta)
--        hold_seats_aluno(evento, poltronas, passe)  conta logada: segura as
--                                        poltronas por 10 minutos fixos, dentro
--                                        do lote e dos 4 da criança
--        anonimizar_lista_de_alunos(lista)  só service_role: apaga nome, CPF e
--                                        nascimento (receita da Doca)
--   3. Recria `hold_seats` e `create_seat_order` (o corpo de hoje, copiado do
--      banco do ar em 28/10, sem mudança) com UM bloco a mais no começo: se o
--      evento tem lista com a trava ligada, `hold_seats` recusa
--      (aluno_obrigatorio) e `create_seat_order` só aceita a reserva que foi
--      segurada por uma criança da lista, confere o lote e os 4 convites de
--      novo, e grava o vínculo do pedido com a criança. Evento sem lista: igual
--      a hoje, linha por linha.
--   4. Recria `release_seats` (revisão 1): não solta mais poltrona presa a um
--      pedido 'pending' ou 'paid'. Vale para todo evento de mapa.
--
-- A CONTA DOS 4
--   Convites em uso de uma criança = ingressos não cancelados dos pedidos dela
--   que estão 'pending' ou 'paid' (pendente conta até a varredura marcar
--   'expired', mesmo passado o prazo: um PIX pago no último minuto não pode
--   abrir a 5ª vaga) + todos os ingressos de pedido contestado
--   ('charged_back': a vaga não volta sozinha) + poltronas seguradas por ela
--   que ainda não viraram pedido dela.
--   As duas sessões somam (todos os pedidos e reservas da criança, de qualquer
--   evento da lista). A linha da criança é travada (FOR NO KEY UPDATE) antes de
--   contar, então duas compras da mesma criança ao mesmo tempo esperam uma a
--   outra; depois as poltronas são travadas em ordem fixa (id), o que tira o
--   deadlock entre famílias que pedem poltronas em comum.
--
-- A JANELA (relógio do banco, horário guardado com fuso)
--   antes de abre_lote1_em ninguém segura · entre os dois, só quem dança UMA
--   sessão · de abre_lote2_em em diante, toda a lista. A chave `trava_ligada`
--   é a "abertura ao público geral" da decisão 1 de 28/10: nasce ligada e só se
--   desliga com o OK do Gabriel (desligada, o evento volta a vender como
--   qualquer evento de poltrona, sem lista).
--
-- QUEM MAIS É ATINGIDO
--   Só evento que tem linha em `listas_alunos_eventos`. Em 28/10 nenhum evento
--   futuro tem poltrona; a lista nasce vazia. `hold_seats` e `create_seat_order`
--   mudam só no bloco novo, que não faz nada sem lista.
--
-- VOLTAR ATRÁS
--   Desligar a trava de uma lista: update listas_alunos set trava_ligada=false.
--   Tirar tudo: recriar `hold_seats`, `create_seat_order` e `release_seats` como estão no topo
--   do arquivo _docs/os346-bale/volta.sql e apagar as tabelas e funções novas
--   (o mesmo arquivo). Pedido nenhum é apagado.
-- ============================================================================

set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------

create table public.listas_alunos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  limite_por_aluno integer not null default 4 check (limite_por_aluno between 1 and 20),
  abre_lote1_em    timestamptz not null,
  abre_lote2_em    timestamptz not null,
  trava_ligada     boolean not null default true,
  apagar_dados_em  date not null,
  dados_apagados_em timestamptz,
  criado_em        timestamptz not null default now(),
  constraint listas_alunos_lotes_em_ordem check (abre_lote2_em >= abre_lote1_em)
);
comment on table public.listas_alunos is
  'OS-346. Lista de alunos de uma escola: só compra poltrona quem informa CPF e nascimento de uma criança daqui. trava_ligada=false é a abertura ao público (só com OK do Gabriel).';

create table public.listas_alunos_eventos (
  event_id uuid primary key references public.events(id) on delete cascade,
  lista_id uuid not null references public.listas_alunos(id) on delete cascade
);
create index listas_alunos_eventos_lista_idx on public.listas_alunos_eventos(lista_id);

create table public.alunos_lista (
  id             uuid primary key default gen_random_uuid(),
  lista_id       uuid not null references public.listas_alunos(id) on delete cascade,
  nome           text,
  cpf            text,
  nascimento     date,
  danca_nas_duas boolean not null,
  criado_em      timestamptz not null default now(),
  anonimizado_em timestamptz,
  constraint alunos_lista_cpf_valido
    check (cpf is null or (length(cpf) = 11 and public.documento_valido(cpf))),
  constraint alunos_lista_dados_completos
    check (anonimizado_em is not null or (nome is not null and cpf is not null and nascimento is not null))
);
create unique index alunos_lista_cpf_uniq on public.alunos_lista(lista_id, cpf) where cpf is not null;
comment on column public.alunos_lista.danca_nas_duas is
  'false = dança uma sessão (1º lote, abre_lote1_em) · true = dança as duas (2º lote, abre_lote2_em).';

create table public.alunos_passes (
  passe     uuid primary key default gen_random_uuid(),
  aluno_id  uuid not null references public.alunos_lista(id) on delete cascade,
  user_id   uuid not null,
  criado_em timestamptz not null default now(),
  vale_ate  timestamptz not null
);
create index alunos_passes_aluno_idx on public.alunos_passes(aluno_id);

create table public.alunos_reservas (
  hold_token text primary key,
  aluno_id   uuid not null references public.alunos_lista(id) on delete cascade,
  event_id   uuid not null,
  user_id    uuid not null,
  criado_em  timestamptz not null default now()
);
create index alunos_reservas_aluno_idx on public.alunos_reservas(aluno_id);

create table public.alunos_pedidos (
  order_id  uuid primary key references public.orders(id) on delete cascade,
  aluno_id  uuid not null references public.alunos_lista(id),
  lista_id  uuid not null references public.listas_alunos(id),
  criado_em timestamptz not null default now()
);
create index alunos_pedidos_aluno_idx on public.alunos_pedidos(aluno_id);

alter table public.listas_alunos         enable row level security;
alter table public.listas_alunos_eventos enable row level security;
alter table public.alunos_lista          enable row level security;
alter table public.alunos_passes         enable row level security;
alter table public.alunos_reservas       enable row level security;
alter table public.alunos_pedidos        enable row level security;

revoke all on table public.listas_alunos         from public, anon, authenticated;
revoke all on table public.listas_alunos_eventos from public, anon, authenticated;
revoke all on table public.alunos_lista          from public, anon, authenticated;
revoke all on table public.alunos_passes         from public, anon, authenticated;
revoke all on table public.alunos_reservas       from public, anon, authenticated;
revoke all on table public.alunos_pedidos        from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Convites em uso de uma criança (as duas sessões somadas)
--    _menos_token: a reserva que está virando pedido agora não conta como
--    reserva (ela vai virar os ingressos deste pedido).
-- ---------------------------------------------------------------------------
create or replace function public._aluno_convites_em_uso(_aluno_id uuid, _menos_token text default null)
returns integer
language sql
volatile
security definer
set search_path to 'public'
as $$
  select (
    select count(*)::int
      from public.alunos_pedidos ap
      join public.orders o  on o.id = ap.order_id
      join public.tickets t on t.order_id = o.id
     where ap.aluno_id = _aluno_id
       and (
         (o.status in ('pending', 'paid') and t.status <> 'cancelled')
         -- contestação (charged_back) cancela os ingressos, mas o convite
         -- conta como usado: a vaga só volta por decisão humana
         or o.status = 'charged_back'
       )
  ) + (
    select coalesce(sum(coalesce(es.base_capacity, 1)), 0)::int
      from public.alunos_reservas r
      join public.event_seats es on es.hold_token = r.hold_token and es.event_id = r.event_id
     where r.aluno_id = _aluno_id
       and r.hold_token is distinct from _menos_token
       and es.status = 'held'
       and es.hold_expires_at > now()
       -- poltrona que já virou pedido DESTA criança conta pelos ingressos
       -- (pedido de outra criança preso na poltrona, resto de reserva vencida,
       -- não tira a poltrona da conta desta)
       and not exists (
         select 1
           from public.alunos_pedidos ap2
           join public.orders o2 on o2.id = ap2.order_id
          where ap2.order_id = es.order_id
            and ap2.aluno_id = r.aluno_id
            and o2.status in ('pending', 'paid', 'charged_back')
       )
  );
$$;
revoke all on function public._aluno_convites_em_uso(uuid, text) from public, anon, authenticated;
grant execute on function public._aluno_convites_em_uso(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. O que a tela pública pode saber (sem dado de pessoa)
-- ---------------------------------------------------------------------------
create or replace function public.evento_lista_info(_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select jsonb_build_object(
        'tem_lista', true,
        'lista_id', l.id,
        'limite_por_aluno', l.limite_por_aluno,
        'abre_lote1_em', l.abre_lote1_em,
        'abre_lote2_em', l.abre_lote2_em,
        'sessoes', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'event_id', e.id, 'slug', e.slug, 'title', e.title,
                   'date', e.date, 'time', e.time)
                 order by e.date, e.time)
            from public.listas_alunos_eventos le2
            join public.events e on e.id = le2.event_id
           where le2.lista_id = l.id
             and e.status = 'published'
        ), '[]'::jsonb)
      )
       from public.listas_alunos_eventos le
       join public.listas_alunos l on l.id = le.lista_id
      where le.event_id = _event_id
        and l.trava_ligada),
    jsonb_build_object('tem_lista', false)
  );
$$;
revoke all on function public.evento_lista_info(uuid) from public;
grant execute on function public.evento_lista_info(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Conferir a criança (CPF + nascimento) e entregar o passe
--    Errar NÃO levanta erro: devolve ok=false, para a tentativa ficar contada
--    (um erro desfaria a contagem junto com o resto da chamada).
-- ---------------------------------------------------------------------------
create or replace function public.aluno_conferir(_event_id uuid, _cpf text, _nascimento date)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  _uid         uuid := auth.uid();
  _lista       public.listas_alunos%rowtype;
  _aluno       public.alunos_lista%rowtype;
  _cpf_limpo   text := regexp_replace(coalesce(_cpf, ''), '[^0-9]', '', 'g');
  _bucket_user text;
  _bucket_cpf  text;
  _bloqueio    timestamptz;
  _usados      integer;
  _abre        timestamptz;
  _passe       uuid;
begin
  if _uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select l.* into _lista
    from public.listas_alunos_eventos le
    join public.listas_alunos l on l.id = le.lista_id
   where le.event_id = _event_id and l.trava_ligada;
  if _lista.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_lista');
  end if;

  _bucket_user := 'aluno:u:' || _uid::text;
  _bucket_cpf  := 'aluno:c:' || md5(_lista.id::text || ':' || _cpf_limpo);

  select max(blocked_until) into _bloqueio
    from public.auth_rate_limits
   where bucket_key in (_bucket_user, _bucket_cpf)
     and blocked_until > now();
  if _bloqueio is not null then
    return jsonb_build_object('ok', false, 'motivo', 'muitas_tentativas', 'tente_de_novo_em', _bloqueio);
  end if;

  if length(_cpf_limpo) = 11 and public.documento_valido(_cpf_limpo) and _nascimento is not null then
    select a.* into _aluno
      from public.alunos_lista a
     where a.lista_id = _lista.id
       and a.cpf = _cpf_limpo
       and a.nascimento = _nascimento
       and a.anonimizado_em is null;
  end if;

  if _aluno.id is null then
    perform public.check_rate_limit(_bucket_user, 8, 900, 900);
    perform public.check_rate_limit(_bucket_cpf, 12, 3600, 3600);
    -- Mesma resposta para CPF fora da lista e nascimento errado: não ensina
    -- quem está testando quais CPFs estão na lista.
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado');
  end if;

  _usados := public._aluno_convites_em_uso(_aluno.id);
  _abre   := case when _aluno.danca_nas_duas then _lista.abre_lote2_em else _lista.abre_lote1_em end;

  delete from public.alunos_passes where vale_ate < now() - interval '1 day';
  insert into public.alunos_passes (aluno_id, user_id, vale_ate)
  values (_aluno.id, _uid, now() + interval '3 hours')
  returning passe into _passe;

  return jsonb_build_object(
    'ok', true,
    'passe', _passe,
    'vale_ate', now() + interval '3 hours',
    'lista_id', _lista.id,
    -- Só o primeiro nome, para a família confirmar que digitou a criança certa.
    'primeiro_nome', initcap(lower(split_part(btrim(_aluno.nome), ' ', 1))),
    'limite', _lista.limite_por_aluno,
    'usados', _usados,
    'restantes', greatest(0, _lista.limite_por_aluno - _usados),
    'abre_em', _abre,
    'liberado', now() >= _abre
  );
end;
$$;
revoke all on function public.aluno_conferir(uuid, text, date) from public, anon;
grant execute on function public.aluno_conferir(uuid, text, date) to authenticated, service_role;

-- Situação da criança pelo passe (a tela atualiza quantos convites restam
-- depois de uma compra, sem pedir o CPF e o nascimento de novo).
create or replace function public.aluno_pelo_passe(_passe uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  _uid   uuid := auth.uid();
  _aluno public.alunos_lista%rowtype;
  _lista public.listas_alunos%rowtype;
  _vale  timestamptz;
  _usados integer;
  _abre  timestamptz;
begin
  if _uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select p.vale_ate into _vale
    from public.alunos_passes p
   where p.passe = _passe and p.user_id = _uid and p.vale_ate > now();
  select a.* into _aluno
    from public.alunos_passes p
    join public.alunos_lista a on a.id = p.aluno_id
   where p.passe = _passe and p.user_id = _uid and p.vale_ate > now() and a.anonimizado_em is null;
  if _aluno.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'passe_vencido');
  end if;
  select * into _lista from public.listas_alunos where id = _aluno.lista_id and trava_ligada;
  if _lista.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_lista');
  end if;
  _usados := public._aluno_convites_em_uso(_aluno.id);
  _abre   := case when _aluno.danca_nas_duas then _lista.abre_lote2_em else _lista.abre_lote1_em end;
  return jsonb_build_object(
    'ok', true,
    'passe', _passe,
    'vale_ate', _vale,
    'lista_id', _lista.id,
    'primeiro_nome', initcap(lower(split_part(btrim(_aluno.nome), ' ', 1))),
    'limite', _lista.limite_por_aluno,
    'usados', _usados,
    'restantes', greatest(0, _lista.limite_por_aluno - _usados),
    'abre_em', _abre,
    'liberado', now() >= _abre
  );
end;
$$;
revoke all on function public.aluno_pelo_passe(uuid) from public, anon;
grant execute on function public.aluno_pelo_passe(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Segurar poltronas em nome de uma criança da lista
--    Mesmo miolo da hold_seats, com: passe da conta logada, lote aberto, os 4
--    da criança, e janela FIXA de 10 minutos (o navegador não escolhe).
-- ---------------------------------------------------------------------------
create or replace function public.hold_seats_aluno(_event_id uuid, _seat_ids uuid[], _passe uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _uid        uuid := auth.uid();
  _token      text := gen_random_uuid()::text;
  _expires_at timestamptz := now() + interval '10 minutes';
  _lista      public.listas_alunos%rowtype;
  _aluno      public.alunos_lista%rowtype;
  _ids        uuid[];
  _requested  integer;
  _updated    integer;
  _qtd        integer;
  _usados     integer;
  _abre       timestamptz;
begin
  if _uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if _seat_ids is null or array_length(_seat_ids, 1) is null then
    raise exception 'no_seats_requested' using errcode = '22023';
  end if;
  _ids := array(select distinct unnest(_seat_ids));
  _requested := array_length(_ids, 1);

  select l.* into _lista
    from public.listas_alunos_eventos le
    join public.listas_alunos l on l.id = le.lista_id
   where le.event_id = _event_id and l.trava_ligada;
  if _lista.id is null then
    raise exception 'event_without_list' using errcode = 'P0001';
  end if;

  -- O passe é desta conta, está valendo e é de uma criança desta lista. A
  -- linha da criança fica travada até o fim (NO KEY: a conferência de outra
  -- aba, que só grava um passe, não precisa esperar): duas compras da mesma criança ao
  -- mesmo tempo esperam uma a outra, e a conta dos 4 não escorrega.
  select a.* into _aluno
    from public.alunos_passes p
    join public.alunos_lista a on a.id = p.aluno_id
   where p.passe = _passe
     and p.user_id = _uid
     and p.vale_ate > now()
     and a.lista_id = _lista.id
     and a.anonimizado_em is null
   for no key update of a;
  if _aluno.id is null then
    raise exception 'aluno_obrigatorio' using errcode = 'P0001';
  end if;

  _abre := case when _aluno.danca_nas_duas then _lista.abre_lote2_em else _lista.abre_lote1_em end;
  if now() < _abre then
    raise exception 'venda_nao_abriu' using errcode = 'P0001';
  end if;

  -- As poltronas pedidas são travadas em ordem fixa (id) antes de mexer:
  -- duas famílias pedindo poltronas em comum, em ordens diferentes, não ficam
  -- uma esperando a outra para sempre (deadlock). A corrida da réplica achou
  -- isso: 101 de 1.500 tentativas morriam em deadlock sem esta linha.
  perform 1 from public.event_seats
    where event_id = _event_id and id = any(_ids)
    order by id
    for update;

  if not exists (select 1 from public.events
                  where id = _event_id and status = 'published' and seat_map_public = true) then
    raise exception 'event_not_available' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.event_seats
              where event_id = _event_id and id = any(_ids) and coalesce(base_price, 0) <= 0) then
    raise exception 'seat_without_price' using errcode = 'P0001';
  end if;

  select coalesce(sum(coalesce(base_capacity, 1)), 0) into _qtd
    from public.event_seats
   where event_id = _event_id and id = any(_ids);
  _usados := public._aluno_convites_em_uso(_aluno.id);
  if _usados + _qtd > _lista.limite_por_aluno then
    raise exception 'limite_do_aluno' using errcode = 'P0001';
  end if;

  with upd as (
    update public.event_seats es
       set status = 'held', held_by_user_id = _uid, hold_token = _token,
           hold_expires_at = _expires_at, updated_at = now()
     where es.event_id = _event_id and es.id = any(_ids)
       and (es.status = 'available' or (es.status = 'held' and es.hold_expires_at < now()))
       -- poltrona presa a um pedido que ainda pode ser pago (PIX no último
       -- minuto) não é retomada antes de a varredura vencer o pedido
       and not exists (select 1 from public.orders o
                        where o.id = es.order_id and o.status in ('pending', 'paid'))
    returning es.id
  ) select count(*) into _updated from upd;

  if _updated <> _requested then
    raise exception 'seats_unavailable' using errcode = 'P0001';
  end if;

  insert into public.alunos_reservas (hold_token, aluno_id, event_id, user_id)
  values (_token, _aluno.id, _event_id, _uid);

  return jsonb_build_object(
    'hold_token', _token,
    'expires_at', _expires_at,
    'seats', to_jsonb(_ids),
    'restantes', _lista.limite_por_aluno - _usados - _qtd
  );
end;
$$;
revoke all on function public.hold_seats_aluno(uuid, uuid[], uuid) from public, anon;
grant execute on function public.hold_seats_aluno(uuid, uuid[], uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. hold_seats de sempre, com a porta fechada para evento com lista
--    (corpo copiado do banco do ar em 28/10; só o bloco OS-346 é novo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hold_seats(_event_id uuid, _seat_ids uuid[], _window interval DEFAULT '00:10:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _token text := gen_random_uuid()::text;
  _expires_at timestamptz := now() + _window;
  _updated int; _requested int; _event_ok boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF _seat_ids IS NULL OR array_length(_seat_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_seats_requested' USING ERRCODE = '22023';
  END IF;
  _requested := array_length(_seat_ids, 1);

  -- OS-346: evento com lista de alunos só se segura pela hold_seats_aluno.
  IF EXISTS (SELECT 1 FROM public.listas_alunos_eventos le
               JOIN public.listas_alunos l ON l.id = le.lista_id
              WHERE le.event_id = _event_id AND l.trava_ligada) THEN
    RAISE EXCEPTION 'aluno_obrigatorio' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.events
    WHERE id = _event_id AND status = 'published' AND seat_map_public = true) INTO _event_ok;
  IF NOT _event_ok THEN RAISE EXCEPTION 'event_not_available' USING ERRCODE = 'P0001'; END IF;

  IF EXISTS (SELECT 1 FROM public.event_seats
    WHERE event_id = _event_id AND id = ANY(_seat_ids) AND COALESCE(base_price, 0) <= 0) THEN
    RAISE EXCEPTION 'seat_without_price' USING ERRCODE = 'P0001';
  END IF;

  WITH upd AS (
    UPDATE public.event_seats
       SET status='held', held_by_user_id=_uid, hold_token=_token,
           hold_expires_at=_expires_at, updated_at=now()
     WHERE event_id = _event_id AND id = ANY(_seat_ids)
       AND (status='available' OR (status='held' AND hold_expires_at < now()))
    RETURNING id
  ) SELECT count(*) INTO _updated FROM upd;

  IF _updated <> _requested THEN RAISE EXCEPTION 'seats_unavailable' USING ERRCODE='P0001'; END IF;

  RETURN jsonb_build_object('hold_token',_token,'expires_at',_expires_at,'seats',to_jsonb(_seat_ids));
END;$function$;

-- ---------------------------------------------------------------------------
-- 7. create_seat_order de sempre, com a trava no começo e o vínculo no fim
--    (corpo copiado do banco do ar em 28/10; só os blocos OS-346 são novos)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_seat_order(_event_id uuid, _user_id uuid, _hold_token text, _seats jsonb, _fee_percent numeric, _fee_fixed numeric, _customer_name text, _customer_email text, _customer_cpf text, _customer_phone text, _payment_method text, _window interval DEFAULT '00:15:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _now           timestamptz := now();
  _expires_at    timestamptz := _now + _window;
  _order_id      uuid;
  _subtotal      numeric := 0;
  _service_fee   numeric := 0;
  _total         numeric := 0;
  _seat_row      RECORD;
  _seat_id       uuid;
  _addons        int;
  _resolved_qty  int;
  _line_price    numeric;
  _norm_cpf      text;
  -- OS-346
  _lista         public.listas_alunos%ROWTYPE;
  _aluno         public.alunos_lista%ROWTYPE;
  _qtd_aluno     int;
  _usados_aluno  int;
BEGIN
  IF _event_id IS NULL OR _user_id IS NULL OR _hold_token IS NULL THEN
    RAISE EXCEPTION 'missing_arg' USING ERRCODE = '22023';
  END IF;
  IF _seats IS NULL OR jsonb_array_length(_seats) = 0 THEN
    RAISE EXCEPTION 'no_seats' USING ERRCODE = '22023';
  END IF;
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'invalid_payment_method:%', _payment_method USING ERRCODE = '22023';
  END IF;
  IF _customer_name IS NULL OR length(btrim(_customer_name)) = 0 THEN
    RAISE EXCEPTION 'missing_customer_name' USING ERRCODE = '22023';
  END IF;

  -- OS-346: evento com lista de alunos. A reserva tem de ter sido segurada
  -- por uma criança da lista (hold_seats_aluno), por esta conta; o lote tem de
  -- estar aberto para ela; e os 4 convites são conferidos de novo, com a linha
  -- da criança travada. Nada é criado antes disto.
  SELECT l.* INTO _lista
    FROM public.listas_alunos_eventos le
    JOIN public.listas_alunos l ON l.id = le.lista_id
   WHERE le.event_id = _event_id AND l.trava_ligada;
  IF _lista.id IS NOT NULL THEN
    SELECT a.* INTO _aluno
      FROM public.alunos_reservas r
      JOIN public.alunos_lista a ON a.id = r.aluno_id
     WHERE r.hold_token = _hold_token
       AND r.event_id = _event_id
       AND r.user_id = _user_id
       AND a.lista_id = _lista.id
       AND a.anonimizado_em IS NULL
     FOR NO KEY UPDATE OF a;
    IF _aluno.id IS NULL THEN
      RAISE EXCEPTION 'aluno_obrigatorio' USING ERRCODE = 'P0001';
    END IF;
    IF _now < (CASE WHEN _aluno.danca_nas_duas THEN _lista.abre_lote2_em ELSE _lista.abre_lote1_em END) THEN
      RAISE EXCEPTION 'venda_nao_abriu' USING ERRCODE = 'P0001';
    END IF;
    -- poltronas travadas na mesma ordem fixa da hold_seats_aluno (sem deadlock)
    PERFORM 1 FROM public.event_seats
      WHERE event_id = _event_id
        AND id IN (SELECT (s->>'seat_id')::uuid FROM jsonb_array_elements(_seats) s)
      ORDER BY id
      FOR UPDATE;
    -- Mesma reserva pedida de novo (PIX gerado duas vezes, tela recarregada):
    -- a poltrona já está num pedido. Recusa com o MESMO código do laço abaixo,
    -- ANTES da conta dos 4 (senão a conta somaria o pedido 1 com ele mesmo e
    -- diria "convites já usados", e a tela soltaria a reserva de um PIX vivo).
    IF EXISTS (SELECT 1 FROM public.event_seats es
                WHERE es.event_id = _event_id
                  AND es.id IN (SELECT (s->>'seat_id')::uuid FROM jsonb_array_elements(_seats) s)
                  AND es.order_id IS NOT NULL) THEN
      RAISE EXCEPTION 'order_already_in_progress' USING ERRCODE = 'P0001';
    END IF;
    SELECT COALESCE(sum(COALESCE(es.base_capacity, 1)
                        + GREATEST(0, COALESCE((s->>'addons')::int, 0))), 0)
      INTO _qtd_aluno
      FROM jsonb_array_elements(_seats) s
      JOIN public.event_seats es ON es.id = (s->>'seat_id')::uuid AND es.event_id = _event_id;
    _usados_aluno := public._aluno_convites_em_uso(_aluno.id, _hold_token);
    IF _usados_aluno + _qtd_aluno > _lista.limite_por_aluno THEN
      RAISE EXCEPTION 'limite_do_aluno' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  _norm_cpf := NULLIF(regexp_replace(coalesce(_customer_cpf,''), '\D', '', 'g'), '');

  INSERT INTO public.orders(
    event_id, user_id, status, total_amount, service_fee_amount, discount_amount,
    customer_name, customer_email, customer_cpf, customer_phone,
    payment_method, sale_origin, expires_at
  ) VALUES (
    _event_id, _user_id, 'pending', 0, 0, 0,
    _customer_name, _customer_email, _norm_cpf, _customer_phone,
    _payment_method, 'online', _expires_at
  )
  RETURNING id INTO _order_id;

  -- OS-346: o pedido fica ligado à criança (é por ele que os 4 são contados).
  IF _aluno.id IS NOT NULL THEN
    INSERT INTO public.alunos_pedidos (order_id, aluno_id, lista_id)
    VALUES (_order_id, _aluno.id, _lista.id);
  END IF;

  FOR _seat_id, _addons IN
    SELECT (s->>'seat_id')::uuid, GREATEST(0, COALESCE((s->>'addons')::int, 0))
      FROM jsonb_array_elements(_seats) s
  LOOP
    SELECT es.* INTO _seat_row
      FROM public.event_seats es
     WHERE es.id = _seat_id AND es.event_id = _event_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'seat_not_found:%', _seat_id USING ERRCODE = 'P0002';
    END IF;

    IF _seat_row.order_id IS NOT NULL AND _seat_row.order_id <> _order_id THEN
      RAISE EXCEPTION 'order_already_in_progress:%', _seat_id USING ERRCODE = 'P0001';
    END IF;

    IF _seat_row.status <> 'held' THEN
      RAISE EXCEPTION 'seat_not_held:%', _seat_id USING ERRCODE = 'P0001';
    END IF;
    IF _seat_row.hold_token IS DISTINCT FROM _hold_token THEN
      RAISE EXCEPTION 'invalid_hold_token:%', _seat_id USING ERRCODE = 'P0001';
    END IF;
    IF _seat_row.held_by_user_id IS DISTINCT FROM _user_id THEN
      RAISE EXCEPTION 'seat_not_yours:%', _seat_id USING ERRCODE = 'P0001';
    END IF;
    IF _seat_row.hold_expires_at IS NULL OR _seat_row.hold_expires_at < _now THEN
      RAISE EXCEPTION 'hold_expired:%', _seat_id USING ERRCODE = 'P0001';
    END IF;

    IF _addons > (COALESCE(_seat_row.max_capacity,0) - COALESCE(_seat_row.base_capacity,0)) THEN
      RAISE EXCEPTION 'addons_exceed_max:%', _seat_id USING ERRCODE = '22023';
    END IF;

    _resolved_qty := COALESCE(_seat_row.base_capacity, 1) + _addons;
    _line_price   := COALESCE(_seat_row.base_price, 0)
                   + (_addons * COALESCE(_seat_row.extra_price, 0));
    _subtotal     := _subtotal + _line_price;

    UPDATE public.event_seats
       SET order_id        = _order_id,
           hold_expires_at = _expires_at,
           updated_at      = now()
     WHERE id = _seat_id;

    INSERT INTO public.tickets(order_id, event_id, lot_id, status, event_seat_id, seat_label,
                               holder_name, holder_email, holder_phone, user_id)
    SELECT _order_id, _event_id, NULL, 'pending', _seat_id,
           COALESCE(_seat_row.label, _seat_row.code),
           _customer_name, _customer_email, _customer_phone, _user_id
      FROM generate_series(1, _resolved_qty);
  END LOOP;

  _service_fee := round((_subtotal * COALESCE(_fee_percent,0)/100
                       + COALESCE(_fee_fixed,0))::numeric, 2);
  _total       := GREATEST(0.01, _subtotal + _service_fee);

  UPDATE public.orders
     SET total_amount       = _total,
         service_fee_amount = _service_fee,
         updated_at         = now()
   WHERE id = _order_id;

  RETURN jsonb_build_object(
    'order_id',         _order_id,
    'subtotal',         _subtotal,
    'service_fee',      _service_fee,
    'total',            _total,
    'expires_at',       _expires_at,
    'tickets_created',  (SELECT count(*) FROM public.tickets WHERE order_id = _order_id)
  );
END;$function$;

-- ---------------------------------------------------------------------------
-- 7b. release_seats de sempre, sem soltar poltrona presa a pedido vivo
--     (corpo copiado do banco do ar em 28/10; só a última condição é nova).
--     Achado da revisão 1: a tela solta a reserva quando a pessoa sai do
--     pagamento ou recebe uma recusa, e a poltrona de um PIX já gerado (pedido
--     'pending', ainda pagável) voltava para a venda. Vale para todo evento de
--     mapa (em 28/10, nenhum futuro). Quem solta poltrona de pedido é a
--     varredura de pedido vencido (`release_seats_for_order`), como antes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_seats(_event_id uuid, _hold_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _released int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF _hold_token IS NULL OR length(_hold_token) = 0 THEN
    RAISE EXCEPTION 'missing_token' USING ERRCODE = '22023';
  END IF;

  WITH upd AS (
    UPDATE public.event_seats
       SET status='available', held_by_user_id=NULL, hold_token=NULL,
           hold_expires_at=NULL, order_id=NULL, updated_at=now()
     WHERE event_id=_event_id
       AND hold_token=_hold_token
       AND status='held'
       AND held_by_user_id=_uid
       -- OS-346: poltrona de pedido que ainda pode ser pago fica presa
       AND NOT EXISTS (SELECT 1 FROM public.orders o
                        WHERE o.id = event_seats.order_id AND o.status IN ('pending', 'paid'))
    RETURNING id
  )
  SELECT count(*) INTO _released FROM upd;

  RETURN jsonb_build_object('released', _released);
END;$function$;

-- ---------------------------------------------------------------------------
-- 8. Apagar os dados das crianças (receita da Doca; 30 dias depois do
--    espetáculo). Não toca pedido, ingresso nem fechamento: o pedido guarda só
--    o vínculo com a linha, que fica sem nome, CPF e nascimento.
-- ---------------------------------------------------------------------------
create or replace function public.anonimizar_lista_de_alunos(_lista_id uuid, _antes_da_data boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _lista public.listas_alunos%rowtype;
  _n     integer;
begin
  select * into _lista from public.listas_alunos where id = _lista_id for update;
  if _lista.id is null then
    raise exception 'lista_nao_encontrada' using errcode = 'P0002';
  end if;
  if current_date < _lista.apagar_dados_em and not _antes_da_data then
    raise exception 'ainda_nao_e_a_data:%', _lista.apagar_dados_em using errcode = 'P0001';
  end if;

  update public.alunos_lista
     set nome = null, cpf = null, nascimento = null, anonimizado_em = now()
   where lista_id = _lista_id and anonimizado_em is null;
  get diagnostics _n = row_count;

  delete from public.alunos_passes p
   using public.alunos_lista a
   where a.id = p.aluno_id and a.lista_id = _lista_id;

  update public.listas_alunos set dados_apagados_em = now() where id = _lista_id;

  return jsonb_build_object('lista', _lista_id, 'alunos_anonimizados', _n);
end;
$$;
revoke all on function public.anonimizar_lista_de_alunos(uuid, boolean) from public, anon, authenticated;
grant execute on function public.anonimizar_lista_de_alunos(uuid, boolean) to service_role;
