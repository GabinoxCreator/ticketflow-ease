-- ============================================================================
-- LISTA DE ALUNOS: O MODELO NOVO DO BALÉ, E A VARREDURA QUE NÃO SOLTA POLTRONA
-- DE PEDIDO VIVO (OS-365)
-- 03/11/2026 · Balé da Bruna ("Alice através da Dança", 17/12, duas sessões)
-- Vem depois da 20261029090000 (OS-346), que está no ar desde 03/11 08h21.
-- ============================================================================
--
-- POR QUE
--   Em 29/10 a escola mudou o modelo de venda (Bruna no grupo, aceito pelo
--   Gabriel): a venda abre para TODOS ao mesmo tempo, e cada aluno só compra na
--   sessão em que dança (só a 1ª, só a 2ª ou as duas). A OS-346 usava a sessão
--   para decidir o HORÁRIO (dois lotes); agora ela decide a PERMISSÃO. E a lista
--   chegou sem data de nascimento: em 03/11 o Gabriel decidiu que a trava é só o
--   CPF do aluno.
--   A varredura de reserva vencida (todo minuto) soltava a poltrona de um
--   pedido PIX ainda pendente: quem pagasse no fim do prazo ficava com um pedido
--   pago e a poltrona de volta à venda (o pagamento só marca 'sold' a poltrona
--   que ainda está presa ao pedido). Achado da revisão 3 da OS-346.
--
-- O QUE FAZ
--   1. listas_alunos: um horário só, `abre_em` (era abre_lote1_em; sai o
--      abre_lote2_em).
--   2. listas_alunos_eventos: `sessao` (1, 2...) de cada evento da lista.
--   3. alunos_lista: `sessoes` (em quais sessões o aluno dança, ex. {1} ou
--      {1,2}) no lugar de `danca_nas_duas`; o nascimento deixa de ser
--      obrigatório (se vier, fica guardado, mas não é exigido); e
--      `celular_responsavel`, para o relatório do 1º dia à escola (quem ainda
--      não comprou). anonimizar_lista_de_alunos passa a apagar o celular também.
--   4. aluno_conferir confere SÓ o CPF (o nascimento, se mandado, é ignorado) e
--      devolve as sessões do aluno; aluno_pelo_passe idem.
--   5. hold_seats_aluno e create_seat_order recusam a sessão em que o aluno não
--      dança: `sessao_do_aluno` na reserva (a tela mostra o recado);
--      `aluno_obrigatorio` no pedido (só acontece se a escola trocar a sessão
--      do aluno no meio da reserva; a tela pede o CPF de novo e mostra a sessão
--      certa). Assim as edges não mudam (sem redeploy).
--   6. hold_seats (evento sem lista): a janela que vem do navegador fica entre 1
--      e 10 minutos (antes, qualquer valor), e não retoma poltrona presa a
--      pedido pendente ou pago (achados da OS-346, Entrada 28/10 19:50).
--   7. sweep_expired_event_seat_holds: não solta poltrona presa a pedido
--      pendente ou pago. Quem solta essa poltrona é a expiração do pedido
--      (expire-pending-orders, que antes confere no Marcel se foi pago), como já
--      era para o pedido vencido.
--
-- QUEM MAIS É ATINGIDO
--   1 a 5: só evento com lista (nenhum em 03/11; as tabelas da OS-346 estão
--   vazias, e esta migration RECUSA rodar se não estiverem).
--   6 e 7: todo evento de mapa (poltrona, mesa, camarote). Em 03/11 nenhum
--   evento futuro tem mapa. Para quem tiver: a mesa de um PIX gerado continua
--   presa até o pedido ser pago ou vencer, em vez de voltar à venda 15 min
--   depois com o PIX ainda pagável.
--
-- VOLTAR ATRÁS
--   _docs/os365-bale/volta.sql (recria as funções e colunas da OS-346 como
--   estavam no ar em 03/11). Pedido nenhum é apagado.
-- ============================================================================

set local lock_timeout = '3s';

do $$
begin
  if exists (select 1 from public.alunos_lista)
     or exists (select 1 from public.listas_alunos_eventos)
     or exists (select 1 from public.listas_alunos) then
    raise exception 'OS-365: a lista de alunos já tem dados; esta migration supõe as tabelas vazias (rever antes de aplicar)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 a 3. Colunas
-- ---------------------------------------------------------------------------
alter table public.listas_alunos drop constraint listas_alunos_lotes_em_ordem;
alter table public.listas_alunos rename column abre_lote1_em to abre_em;
alter table public.listas_alunos drop column abre_lote2_em;
comment on column public.listas_alunos.abre_em is
  'OS-365: a venda abre para toda a lista neste instante (relógio do banco).';

alter table public.listas_alunos_eventos
  add column sessao smallint not null check (sessao between 1 and 9);
create unique index listas_alunos_eventos_sessao_uniq
  on public.listas_alunos_eventos(lista_id, sessao);
comment on column public.listas_alunos_eventos.sessao is
  'OS-365: número da sessão deste evento na lista (1 = 1ª sessão).';

alter table public.alunos_lista drop constraint alunos_lista_dados_completos;
alter table public.alunos_lista drop column danca_nas_duas;
alter table public.alunos_lista
  add column sessoes smallint[] not null
    check (cardinality(sessoes) between 1 and 9 and 0 < all(sessoes) and 10 > all(sessoes));
alter table public.alunos_lista
  add constraint alunos_lista_dados_completos
    check (anonimizado_em is not null or (nome is not null and cpf is not null));
comment on column public.alunos_lista.sessoes is
  'OS-365: sessões em que o aluno dança (listas_alunos_eventos.sessao). Só compra nelas.';
comment on column public.alunos_lista.nascimento is
  'OS-365: opcional; guardado se a escola mandar, não é conferido.';
alter table public.alunos_lista add column celular_responsavel text;
comment on column public.alunos_lista.celular_responsavel is
  'OS-365: celular do responsável, como a escola mandou. Só para o relatório à escola; apagado junto com o resto.';

-- ---------------------------------------------------------------------------
-- O que a tela pública pode saber (sem dado de pessoa)
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
        'abre_em', l.abre_em,
        'sessao', le.sessao,
        'sessoes', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'event_id', e.id, 'slug', e.slug, 'title', e.title,
                   'date', e.date, 'time', e.time, 'sessao', le2.sessao)
                 order by le2.sessao)
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

-- ---------------------------------------------------------------------------
-- Conferir o aluno (SÓ o CPF) e entregar o passe.
-- O `_nascimento` continua na assinatura para a tela antiga não quebrar entre a
-- migration e a publicação; é ignorado.
-- ---------------------------------------------------------------------------
create or replace function public.aluno_conferir(_event_id uuid, _cpf text, _nascimento date default null)
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

  if length(_cpf_limpo) = 11 and public.documento_valido(_cpf_limpo) then
    select a.* into _aluno
      from public.alunos_lista a
     where a.lista_id = _lista.id
       and a.cpf = _cpf_limpo
       and a.anonimizado_em is null;
  end if;

  if _aluno.id is null then
    -- Só o CPF agora: a contagem por conta (8 em 15 min) é o que segura quem
    -- tenta adivinhar CPF da lista.
    perform public.check_rate_limit(_bucket_user, 8, 900, 900);
    perform public.check_rate_limit(_bucket_cpf, 12, 3600, 3600);
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado');
  end if;

  _usados := public._aluno_convites_em_uso(_aluno.id);

  delete from public.alunos_passes where vale_ate < now() - interval '1 day';
  insert into public.alunos_passes (aluno_id, user_id, vale_ate)
  values (_aluno.id, _uid, now() + interval '3 hours')
  returning passe into _passe;

  return jsonb_build_object(
    'ok', true,
    'passe', _passe,
    'vale_ate', now() + interval '3 hours',
    'lista_id', _lista.id,
    -- Só o primeiro nome, para a família confirmar que digitou o aluno certo.
    'primeiro_nome', initcap(lower(split_part(btrim(_aluno.nome), ' ', 1))),
    'sessoes', to_jsonb(_aluno.sessoes),
    'limite', _lista.limite_por_aluno,
    'usados', _usados,
    'restantes', greatest(0, _lista.limite_por_aluno - _usados),
    'abre_em', _lista.abre_em,
    'liberado', now() >= _lista.abre_em
  );
end;
$$;
revoke all on function public.aluno_conferir(uuid, text, date) from public, anon;
grant execute on function public.aluno_conferir(uuid, text, date) to authenticated, service_role;

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
  return jsonb_build_object(
    'ok', true,
    'passe', _passe,
    'vale_ate', _vale,
    'lista_id', _lista.id,
    'primeiro_nome', initcap(lower(split_part(btrim(_aluno.nome), ' ', 1))),
    'sessoes', to_jsonb(_aluno.sessoes),
    'limite', _lista.limite_por_aluno,
    'usados', _usados,
    'restantes', greatest(0, _lista.limite_por_aluno - _usados),
    'abre_em', _lista.abre_em,
    'liberado', now() >= _lista.abre_em
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Segurar poltronas em nome de um aluno: a sessão tem de ser uma em que ele
-- dança (o resto é o da OS-346: passe, abertura, os 4, janela fixa de 10 min).
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
  _sessao     smallint;
  _aluno      public.alunos_lista%rowtype;
  _ids        uuid[];
  _requested  integer;
  _updated    integer;
  _qtd        integer;
  _usados     integer;
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
  select le.sessao into _sessao from public.listas_alunos_eventos le where le.event_id = _event_id;

  -- O passe é desta conta, está valendo e é de um aluno desta lista. A linha
  -- do aluno fica travada até o fim (NO KEY: a conferência de outra aba, que só
  -- grava um passe, não precisa esperar): duas compras do mesmo aluno ao mesmo
  -- tempo esperam uma a outra, e a conta dos 4 não escorrega.
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

  if now() < _lista.abre_em then
    raise exception 'venda_nao_abriu' using errcode = 'P0001';
  end if;

  -- OS-365: só na sessão em que o aluno dança.
  if not (_sessao = any(_aluno.sessoes)) then
    raise exception 'sessao_do_aluno' using errcode = 'P0001';
  end if;

  -- As poltronas pedidas são travadas em ordem fixa (id) antes de mexer:
  -- duas famílias pedindo poltronas em comum, em ordens diferentes, não ficam
  -- uma esperando a outra para sempre (deadlock).
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
       -- minuto) não é retomada antes de a expiração vencer o pedido
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

-- ---------------------------------------------------------------------------
-- hold_seats de sempre (evento sem lista). Corpo do ar de 03/11 com duas
-- mudanças: a janela fica entre 1 e 10 minutos, e poltrona presa a pedido
-- pendente ou pago não é retomada.
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
  -- OS-365: o navegador não escolhe a janela além de 10 minutos.
  _expires_at timestamptz := now() + LEAST(GREATEST(COALESCE(_window, interval '10 minutes'), interval '1 minute'), interval '10 minutes');
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
       -- OS-365: poltrona de pedido que ainda pode ser pago não é retomada
       AND NOT EXISTS (SELECT 1 FROM public.orders o
                        WHERE o.id = event_seats.order_id AND o.status IN ('pending', 'paid'))
    RETURNING id
  ) SELECT count(*) INTO _updated FROM upd;

  IF _updated <> _requested THEN RAISE EXCEPTION 'seats_unavailable' USING ERRCODE='P0001'; END IF;

  RETURN jsonb_build_object('hold_token',_token,'expires_at',_expires_at,'seats',to_jsonb(_seat_ids));
END;$function$;

-- ---------------------------------------------------------------------------
-- create_seat_order (corpo do ar de 03/11). Muda só o bloco da lista: um
-- horário de abertura, e a sessão tem de ser uma em que o aluno dança.
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
  -- OS-346 / OS-365
  _lista         public.listas_alunos%ROWTYPE;
  _sessao        smallint;
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
  -- por um aluno da lista (hold_seats_aluno), por esta conta; a venda tem de
  -- estar aberta; a sessão tem de ser uma em que o aluno dança (OS-365); e os
  -- 4 convites são conferidos de novo, com a linha do aluno travada. Nada é
  -- criado antes disto.
  SELECT l.* INTO _lista
    FROM public.listas_alunos_eventos le
    JOIN public.listas_alunos l ON l.id = le.lista_id
   WHERE le.event_id = _event_id AND l.trava_ligada;
  IF _lista.id IS NOT NULL THEN
    SELECT le.sessao INTO _sessao FROM public.listas_alunos_eventos le WHERE le.event_id = _event_id;
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
    IF _now < _lista.abre_em THEN
      RAISE EXCEPTION 'venda_nao_abriu' USING ERRCODE = 'P0001';
    END IF;
    -- A escola trocou a sessão do aluno no meio da reserva: mesmo recado de
    -- "informe o aluno de novo" (a tela confere e mostra a sessão certa), para
    -- as edges não precisarem de código novo.
    IF NOT (_sessao = ANY(_aluno.sessoes)) THEN
      RAISE EXCEPTION 'aluno_obrigatorio' USING ERRCODE = 'P0001';
    END IF;
    -- poltronas travadas na mesma ordem fixa da hold_seats_aluno (sem deadlock)
    PERFORM 1 FROM public.event_seats
      WHERE event_id = _event_id
        AND id IN (SELECT (s->>'seat_id')::uuid FROM jsonb_array_elements(_seats) s)
      ORDER BY id
      FOR UPDATE;
    -- Mesma reserva pedida de novo (PIX gerado duas vezes, tela recarregada):
    -- a poltrona já está num pedido. Recusa com o MESMO código do laço abaixo,
    -- ANTES da conta dos 4.
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

  -- OS-346: o pedido fica ligado ao aluno (é por ele que os 4 são contados).
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
-- A varredura de todo minuto não solta poltrona presa a pedido pendente ou
-- pago. Pedido vencido: quem solta é a expire-pending-orders (que antes
-- confere no Marcel se o PIX foi pago), marcando o pedido primeiro e soltando
-- a poltrona depois.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_event_seat_holds()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _n int;
BEGIN
  WITH upd AS (
    UPDATE public.event_seats
       SET status='available', held_by_user_id=NULL, hold_token=NULL,
           hold_expires_at=NULL, order_id=NULL, updated_at=now()
     WHERE status='held' AND hold_expires_at < now()
       -- OS-365: poltrona de pedido que ainda pode ser pago fica presa
       AND NOT EXISTS (SELECT 1 FROM public.orders o
                        WHERE o.id = event_seats.order_id AND o.status IN ('pending', 'paid'))
    RETURNING id
  )
  SELECT count(*) INTO _n FROM upd;
  RETURN _n;
END;$function$;

-- ---------------------------------------------------------------------------
-- Apagar os dados dos alunos (OS-346), agora com o celular do responsável.
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
     set nome = null, cpf = null, nascimento = null, celular_responsavel = null, anonimizado_em = now()
   where lista_id = _lista_id and anonimizado_em is null;
  get diagnostics _n = row_count;

  delete from public.alunos_passes p
   using public.alunos_lista a
   where a.id = p.aluno_id and a.lista_id = _lista_id;

  update public.listas_alunos set dados_apagados_em = now() where id = _lista_id;

  return jsonb_build_object('lista', _lista_id, 'alunos_anonimizados', _n);
end;
$$;
