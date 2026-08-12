-- Hardening #6 e #7 (12/08/2026) — fecha os dois últimos itens de
-- _docs/hardening-site-11-08.md.
-- ⚠️ Aplicar no SQL Editor (commitar ≠ aplicar). Aditivo primeiro (RPCs),
-- restrição depois — o front novo precisa estar publicado antes dos revokes.

-- ============================================================
-- #6 — taxa da plataforma deixa de ser listável por qualquer um
-- ============================================================
-- Antes: policy USING(true) permitia baixar a tabela INTEIRA (taxa negociada de
-- todos os eventos + notes da negociação) com a anon key. O checkout só precisa
-- dos 4 números do evento que está sendo comprado — é o que a RPC devolve.
-- Sem override cadastrado, devolve o mesmo default do front e das edges (10% / 0).
create or replace function public.get_event_fees(_event_id uuid)
returns table (
  pix_percent numeric,
  pix_fixed numeric,
  card_percent numeric,
  card_fixed numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(max(case when payment_method = 'pix'  then fee_percent end), 10),
    coalesce(max(case when payment_method = 'pix'  then fee_fixed   end), 0),
    coalesce(max(case when payment_method = 'card' then fee_percent end), 10),
    coalesce(max(case when payment_method = 'card' then fee_fixed   end), 0)
  from public.event_fee_overrides
  where event_id = _event_id;
$$;

revoke all on function public.get_event_fees(uuid) from public;
grant execute on function public.get_event_fees(uuid) to anon, authenticated, service_role;

-- Restrição (aplicar só depois do front novo no ar). As edges de cobrança leem
-- com service_role (imune a RLS) — auditado: process-card-payment,
-- create-mercadopago-pix, confra-process-card, collaborator-*.
drop policy if exists "Anyone can view fee overrides" on public.event_fee_overrides;
create policy "Admins can view fee overrides"
  on public.event_fee_overrides for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- #7 — like: ninguém apaga curtida alheia; like vira funil de cadastro
-- ============================================================
-- Antes: DELETE/INSERT com USING/CHECK (true) — um curl apagava TODOS os likes
-- de TODOS os eventos. Agora o toggle passa por RPC que só mexe na curtida do
-- próprio navegador (anonymous_id) ou da própria conta (user_id).
alter table public.event_likes add column if not exists user_id uuid;
create index if not exists idx_event_likes_user_id on public.event_likes(user_id);

-- Contador público + "eu já curti?" numa chamada só.
create or replace function public.get_event_like_state(_event_id uuid, _anonymous_id text)
returns table (like_count integer, liked boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from public.event_likes where event_id = _event_id),
    exists (
      select 1 from public.event_likes l
       where l.event_id = _event_id
         and (l.anonymous_id = _anonymous_id
              or (auth.uid() is not null and l.user_id = auth.uid()))
    );
$$;

create or replace function public.toggle_event_like(_event_id uuid, _anonymous_id text)
returns table (like_count integer, liked boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _removed integer;
begin
  if _anonymous_id is null or length(_anonymous_id) not between 8 and 64 then
    raise exception 'anonymous_id invalido';
  end if;
  if not exists (select 1 from public.events where id = _event_id) then
    raise exception 'evento inexistente';
  end if;

  delete from public.event_likes l
   where l.event_id = _event_id
     and (l.anonymous_id = _anonymous_id
          or (auth.uid() is not null and l.user_id = auth.uid()));
  get diagnostics _removed = row_count;

  if _removed = 0 then
    insert into public.event_likes (event_id, anonymous_id, user_id)
    values (_event_id, _anonymous_id, auth.uid())
    on conflict (event_id, anonymous_id) do nothing;
  end if;

  return query select * from public.get_event_like_state(_event_id, _anonymous_id);
end;
$$;

-- Adoção do like anônimo pela conta criada depois (mesma ideia do
-- claim_my_orphan_orders). Idempotente; sem sessão, não faz nada.
create or replace function public.claim_my_anonymous_likes(_anonymous_id text)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _n integer;
begin
  if auth.uid() is null then return 0; end if;
  if _anonymous_id is null or length(_anonymous_id) not between 8 and 64 then return 0; end if;

  -- se a conta já curtiu o mesmo evento por outro caminho, o órfão vira
  -- duplicata: apaga em vez de estourar a unique (event_id, anonymous_id)
  delete from public.event_likes orphan
   where orphan.anonymous_id = _anonymous_id
     and orphan.user_id is null
     and exists (
       select 1 from public.event_likes mine
        where mine.event_id = orphan.event_id
          and mine.user_id = auth.uid()
     );

  update public.event_likes
     set user_id = auth.uid()
   where anonymous_id = _anonymous_id
     and user_id is null;
  get diagnostics _n = row_count;
  return _n;
end;
$$;

revoke all on function public.get_event_like_state(uuid, text) from public;
grant execute on function public.get_event_like_state(uuid, text) to anon, authenticated;
revoke all on function public.toggle_event_like(uuid, text) from public;
grant execute on function public.toggle_event_like(uuid, text) to anon, authenticated;
revoke all on function public.claim_my_anonymous_likes(text) from public, anon;
grant execute on function public.claim_my_anonymous_likes(text) to authenticated;

-- Restrição (aplicar só depois do front novo no ar): acesso direto à tabela
-- morre; tudo passa pelas RPCs acima. Admin mantém leitura (futuro painel de
-- interessados por evento).
drop policy if exists "Anyone can read likes"        on public.event_likes;
drop policy if exists "Anyone can insert likes"      on public.event_likes;
drop policy if exists "Anyone can delete own likes"  on public.event_likes;
revoke all on table public.event_likes from anon, authenticated;
grant select on table public.event_likes to authenticated;
create policy "Admins can view likes"
  on public.event_likes for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

-- VERIFICAÇÕES (depois de aplicar, via REST com a anon key):
--   /rest/v1/event_fee_overrides?select=*            -> []            (era a tabela toda)
--   /rest/v1/event_likes?select=*                    -> 42501 permission denied
--   /rest/v1/rpc/get_event_fees {"_event_id": ...}   -> 1 linha com os 4 números
--   /rest/v1/rpc/get_event_like_state {...}          -> contador + liked
