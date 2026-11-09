-- Lote escondido e link de venda com o carrinho pronto (OS-405, 08/11/2026).
--
-- Nasceu do pedido da Thais (Fogo & Fumaça, 07/11): uma inteira e uma meia para uma mãe
-- que leva a filha especial. O site não tinha como vender meia sem abrir um lote de meia
-- para todo mundo. Decisões do Gabriel (08/11): o lote fica escondido do evento e só sai
-- por um link que já abre o checkout com o carrinho montado; o link vale para UMA compra
-- e vence em 24 horas, com o preço do momento em que foi gerado; só o admin da casa gera.
--
-- 1) `event_lots.escondido`: o lote não aparece na página do evento, na vitrine, no totem
--    nem na maquininha, e nenhuma venda normal o aceita (regra `porQueFechado` das edges e
--    `isLotOpenForSale` da tela). A venda manual do produtor e as cortesias seguem
--    aceitando (é a "venda manual" das palavras do Gabriel).
--    Gatilho próprio (não mexe no `trava_retirada_publica`): só a casa liga ou desliga.
--    Sem ele, o produtor desligaria a coluna pelo PATCH que já pode fazer no lote dele e a
--    meia ficaria à venda para todos.
--
-- 2) `links_de_venda`: o link. Fechada para o navegador (RLS sem regra, sem grant para
--    anon e authenticated). O preço de cada item fica GRAVADO no link, e é dele que a
--    edge cobra; a quantidade e o lote também vêm daqui, nunca da URL nem do corpo.
--    O preço gravado vale só enquanto o MESMO lote está aberto (decisão do Gabriel, 08/11:
--    "Não, recusa quando o lote vira"): encerrou, esgotou ou virou, o link é recusado.
--
-- 3) `orders.link_de_venda_id` com índice único parcial: um link, um pedido vivo ou pago.
--    É o banco que garante o "1 uso", inclusive com duas abas pagando ao mesmo tempo (a
--    edge trata o 23505 como "este link já tem um pagamento"). Pedido recusado ou vencido
--    ('failed', 'expired') sai do índice: a pessoa tenta de novo dentro das 24 horas.
--    Pedido pago que depois foi cancelado, reembolsado ou contestado continua contando:
--    o link já foi usado.
--
-- 4) Funções: `admin_criar_link_de_venda`, `admin_links_de_venda`,
--    `admin_cancelar_link_de_venda` (só a casa) e `link_de_venda_ver` (pública, pelo token,
--    para a página /link/<token> montar o carrinho).
--
-- ⚠️ ORDEM DA SUBIDA: esta migration ANTES das edges e do site. As edges e a vitrine passam
-- a pedir a coluna `escondido` ao banco; sem ela a leitura dos lotes falha e a venda para
-- (site, totem e maquininha).

-- ---------------------------------------------------------------------------------------
-- 1) Lote escondido
-- ---------------------------------------------------------------------------------------
alter table public.event_lots
  add column if not exists escondido boolean not null default false;

comment on column public.event_lots.escondido is
  'Lote fora da venda normal (página, vitrine, totem, maquininha, portaria): só sai pelo link de venda que a casa gera (OS-405). Só a casa liga ou desliga.';

create or replace function public.trava_lote_escondido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mudou boolean;
begin
  -- Vale para INSERT também: sem isso o produtor criaria um lote já escondido (a regra de
  -- INSERT de event_lots não restringe coluna). Para o produtor isso só tiraria o lote dele
  -- da venda, mas a regra fica igual nos dois sentidos: quem esconde e mostra é a casa.
  v_mudou := case when tg_op = 'INSERT'
                  then coalesce(new.escondido, false)
                  else new.escondido is distinct from old.escondido end;
  -- `auth.uid()` nulo = chamada de servidor (service role) ou a casa direto no SQL.
  -- Usuário logado só mexe nisto se for admin.
  if v_mudou and auth.uid() is not null and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Lote escondido só pode ser ligado ou desligado pela FestPag';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trava_lote_escondido on public.event_lots;
create trigger trg_trava_lote_escondido
  before insert or update on public.event_lots
  for each row
  execute function public.trava_lote_escondido();

-- ---------------------------------------------------------------------------------------
-- 2) O link de venda
-- ---------------------------------------------------------------------------------------
create table if not exists public.links_de_venda (
  id            uuid primary key default gen_random_uuid(),
  -- 32 letras hexadecimais (122 bits de sorte): não se adivinha nem se monta à mão.
  token         text not null unique,
  event_id      uuid not null references public.events(id) on delete cascade,
  -- [{ "lot_id": uuid, "quantidade": int, "preco": numeric }]: o preço é o do lote NA HORA
  -- em que o link nasceu, e vale até o link vencer (decisão do Gabriel, 08/11).
  itens         jsonb not null,
  -- Para quem é (ex.: "Thais: mãe e filha, meia"). Só a casa lê.
  nota          text,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null,
  cancelado_em  timestamptz,
  cancelado_por uuid,
  constraint links_de_venda_itens_lista check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) > 0)
);

comment on table public.links_de_venda is
  'Link de checkout com o carrinho pronto (OS-405). Um uso, 24 horas, preço gravado. Só a casa cria; a página /link/<token> lê por link_de_venda_ver.';

create index if not exists links_de_venda_evento on public.links_de_venda (event_id, criado_em desc);

alter table public.links_de_venda enable row level security;
revoke all on public.links_de_venda from anon, authenticated;
grant all on public.links_de_venda to service_role;

-- ---------------------------------------------------------------------------------------
-- 3) O pedido que nasceu do link
-- ---------------------------------------------------------------------------------------
alter table public.orders
  add column if not exists link_de_venda_id uuid references public.links_de_venda(id) on delete set null;

comment on column public.orders.link_de_venda_id is
  'Link de venda (OS-405) de onde o pedido nasceu. Um link, um pedido vivo ou pago (índice orders_link_de_venda_um_uso).';

create unique index if not exists orders_link_de_venda_um_uso
  on public.orders (link_de_venda_id)
  where link_de_venda_id is not null and status not in ('failed', 'expired');

comment on index public.orders_link_de_venda_um_uso is
  'Um uso por link de venda (OS-405): no máximo um pedido pendente ou pago por link. Recusado e vencido saem, e a pessoa tenta de novo. A edge trata o 23505.';

-- ---------------------------------------------------------------------------------------
-- 4) Funções
-- ---------------------------------------------------------------------------------------

-- Situação do link, a mesma conta para a casa e para a página pública.
-- 'lote_encerrado' (decisão do Gabriel, 08/11: "Não, recusa quando o lote vira"): algum
-- lote do link foi desativado, marcado esgotado, passou da data de fim ou acabou o estoque.
-- A edge confere a regra inteira na hora de cobrar (inclusive agenda e encadeado); aqui é
-- o que a página precisa para não mostrar um carrinho que não vai fechar.
create or replace function public._situacao_do_link_de_venda(_link public.links_de_venda)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.orders o
                  where o.link_de_venda_id = _link.id
                    and o.status in ('paid', 'refunded', 'charged_back', 'cancelled')) then 'usado'
    when exists (select 1 from public.orders o
                  where o.link_de_venda_id = _link.id and o.status in ('pending', 'in_review')) then 'em_pagamento'
    when _link.cancelado_em is not null then 'cancelado'
    when _link.expira_em <= now() then 'vencido'
    when exists (select 1
                   from jsonb_array_elements(_link.itens) it
                   left join public.event_lots el on el.id = (it->>'lot_id')::uuid
                  where el.id is null
                     or not coalesce(el.is_active, false)
                     or coalesce(el.manually_sold_out, false)
                     or (el.end_date is not null and el.end_date <= now())
                     or el.total_quantity - el.sold_quantity - coalesce(el.reserved_quantity, 0) < (it->>'quantidade')::int)
      then 'lote_encerrado'
    else 'valendo'
  end;
$$;

revoke all on function public._situacao_do_link_de_venda(public.links_de_venda) from public, anon, authenticated;

-- Quem é a casa: admin logado, service role, ou o SQL direto (fora do PostgREST, sem login).
-- Mesmo critério do admin_corrigir_cpf.
create or replace function public._eh_a_casa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin'::public.app_role)
      or coalesce(auth.role(), '') = 'service_role'
      or (session_user <> 'authenticator' and coalesce(auth.role(), '') = '' and auth.uid() is null);
$$;

revoke all on function public._eh_a_casa() from public, anon, authenticated;

create or replace function public.admin_criar_link_de_venda(_event_id uuid, _itens jsonb, _nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  _ev       record;
  _item     jsonb;
  _lote     record;
  _lot_id   uuid;
  _qtd      numeric;
  _total    integer := 0;
  _vistos   uuid[] := '{}';
  _limpos   jsonb := '[]'::jsonb;
  _token    text;
  _id       uuid;
  _expira   timestamptz := now() + interval '24 hours';
begin
  if not public._eh_a_casa() then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  select id, status, coalesce(payment_provider, 'marcel') as provedor
    into _ev from public.events where id = _event_id;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'evento_nao_encontrado');
  end if;
  if _ev.status <> 'published' then
    return jsonb_build_object('ok', false, 'erro', 'evento_nao_publicado');
  end if;
  -- O link paga pela rota do Marcel (marcel-create-pix e marcel-process-card).
  if _ev.provedor <> 'marcel' then
    return jsonb_build_object('ok', false, 'erro', 'evento_fora_do_marcel');
  end if;

  if _itens is null or jsonb_typeof(_itens) <> 'array' or jsonb_array_length(_itens) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'carrinho_vazio');
  end if;

  for _item in select * from jsonb_array_elements(_itens) loop
    begin
      _lot_id := (_item->>'lot_id')::uuid;
      _qtd := (_item->>'quantidade')::numeric;
    exception when others then
      return jsonb_build_object('ok', false, 'erro', 'item_invalido');
    end;
    if _lot_id is null or _qtd is null or _qtd <> trunc(_qtd) or _qtd < 1 or _qtd > 10 then
      return jsonb_build_object('ok', false, 'erro', 'quantidade_invalida');
    end if;
    if _lot_id = any(_vistos) then
      return jsonb_build_object('ok', false, 'erro', 'lote_repetido');
    end if;
    _vistos := _vistos || _lot_id;

    select id, event_id, price, is_active, retirada_publica, group_ticket_enabled, group_ticket_quantity,
           end_date, sales_start_type, start_date
      into _lote from public.event_lots where id = _lot_id;
    if not found or _lote.event_id <> _event_id then
      return jsonb_build_object('ok', false, 'erro', 'lote_de_outro_evento', 'lot_id', _lot_id);
    end if;
    if not coalesce(_lote.is_active, false) then
      return jsonb_build_object('ok', false, 'erro', 'lote_inativo', 'lot_id', _lot_id);
    end if;
    -- Lote da cortesia por link (OS-313) tem caminho e travas próprias.
    if coalesce(_lote.retirada_publica, false) then
      return jsonb_build_object('ok', false, 'erro', 'lote_de_cortesia', 'lot_id', _lot_id);
    end if;
    -- Lote em grupo (dupla): o preço é do grupo e o servidor desmonta em ingressos; fora
    -- do link para não somar uma regra em cima da outra.
    if coalesce(_lote.group_ticket_enabled, false) and coalesce(_lote.group_ticket_quantity, 1) >= 2 then
      return jsonb_build_object('ok', false, 'erro', 'lote_em_grupo', 'lot_id', _lot_id);
    end if;
    if _lote.price is null or _lote.price <= 0 then
      return jsonb_build_object('ok', false, 'erro', 'lote_sem_preco', 'lot_id', _lot_id);
    end if;
    -- O link só vende enquanto o lote está aberto (decisão do Gabriel, 08/11): não nasce
    -- com lote encerrado nem com lote agendado que ainda não abriu. O encadeado a edge
    -- confere na hora de cobrar.
    if _lote.end_date is not null and _lote.end_date <= now() then
      return jsonb_build_object('ok', false, 'erro', 'lote_encerrado', 'lot_id', _lot_id);
    end if;
    if _lote.sales_start_type = 'scheduled' and _lote.start_date is not null and _lote.start_date > now() then
      return jsonb_build_object('ok', false, 'erro', 'lote_ainda_nao_abriu', 'lot_id', _lot_id);
    end if;

    _total := _total + _qtd::integer;
    _limpos := _limpos || jsonb_build_object('lot_id', _lot_id, 'quantidade', _qtd::integer, 'preco', _lote.price);
  end loop;

  if _total > 50 then
    return jsonb_build_object('ok', false, 'erro', 'quantidade_invalida');
  end if;

  _token := replace(gen_random_uuid()::text, '-', '');
  insert into public.links_de_venda (token, event_id, itens, nota, criado_por, expira_em)
  values (_token, _event_id, _limpos, nullif(btrim(coalesce(_nota, '')), ''), auth.uid(), _expira)
  returning id into _id;

  return jsonb_build_object('ok', true, 'id', _id, 'token', _token, 'expira_em', _expira, 'itens', _limpos);
end;
$fn$;

revoke all on function public.admin_criar_link_de_venda(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_criar_link_de_venda(uuid, jsonb, text) to authenticated, service_role;

create or replace function public.admin_links_de_venda(_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public._eh_a_casa() then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  end if;
  return jsonb_build_object('ok', true, 'links', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id,
             'token', l.token,
             'nota', l.nota,
             'criado_em', l.criado_em,
             'expira_em', l.expira_em,
             'cancelado_em', l.cancelado_em,
             'situacao', public._situacao_do_link_de_venda(l),
             'pedido_id', (select o.id from public.orders o
                            where o.link_de_venda_id = l.id and o.status not in ('failed', 'expired')
                            order by o.created_at desc limit 1),
             'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                                'lot_id', it->>'lot_id',
                                'nome', el.name,
                                'setor', el.sector_name,
                                'quantidade', (it->>'quantidade')::int,
                                'preco', (it->>'preco')::numeric) order by ord), '[]'::jsonb)
                         from jsonb_array_elements(l.itens) with ordinality as x(it, ord)
                         left join public.event_lots el on el.id = (it->>'lot_id')::uuid))
           order by l.criado_em desc)
      from public.links_de_venda l
     where l.event_id = _event_id), '[]'::jsonb));
end;
$fn$;

revoke all on function public.admin_links_de_venda(uuid) from public, anon;
grant execute on function public.admin_links_de_venda(uuid) to authenticated, service_role;

create or replace function public.admin_cancelar_link_de_venda(_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  _l public.links_de_venda;
begin
  if not public._eh_a_casa() then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  end if;
  select * into _l from public.links_de_venda where id = _link_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'link_nao_encontrado');
  end if;
  if public._situacao_do_link_de_venda(_l) = 'usado' then
    return jsonb_build_object('ok', false, 'erro', 'link_ja_usado');
  end if;
  if _l.cancelado_em is null then
    update public.links_de_venda set cancelado_em = now(), cancelado_por = auth.uid() where id = _link_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.admin_cancelar_link_de_venda(uuid) from public, anon;
grant execute on function public.admin_cancelar_link_de_venda(uuid) to authenticated, service_role;

-- Página pública /link/<token>: só o que a tela precisa para montar o carrinho. Nada de
-- quem criou, da nota nem do pedido. Token que não existe devolve só "nao_encontrado".
create or replace function public.link_de_venda_ver(_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  _l  public.links_de_venda;
  _ev record;
begin
  if _token is null or _token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'situacao', 'nao_encontrado');
  end if;
  select * into _l from public.links_de_venda where token = _token;
  if not found then
    return jsonb_build_object('ok', false, 'situacao', 'nao_encontrado');
  end if;
  select id, slug, title, date, time, venue, city, state, image_url
    into _ev from public.events where id = _l.event_id;

  return jsonb_build_object(
    'ok', true,
    'situacao', public._situacao_do_link_de_venda(_l),
    'expira_em', _l.expira_em,
    'evento', jsonb_build_object(
      'id', _ev.id, 'slug', _ev.slug, 'title', _ev.title, 'date', _ev.date, 'time', _ev.time,
      'venue', _ev.venue, 'city', _ev.city, 'state', _ev.state, 'image_url', _ev.image_url),
    'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                       'lot_id', it->>'lot_id',
                       'nome', el.name,
                       'setor', el.sector_name,
                       'modo_taxa', coalesce(el.modo_taxa, 'cliente_paga'),
                       'quantidade', (it->>'quantidade')::int,
                       'preco', (it->>'preco')::numeric) order by ord), '[]'::jsonb)
                from jsonb_array_elements(_l.itens) with ordinality as x(it, ord)
                left join public.event_lots el on el.id = (it->>'lot_id')::uuid)
  );
end;
$fn$;

revoke all on function public.link_de_venda_ver(text) from public;
grant execute on function public.link_de_venda_ver(text) to anon, authenticated, service_role;
