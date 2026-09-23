-- Pedido de repasse passa a AVISAR. Antes, não avisava ninguém.
--
-- Por que (23/09/2026): a Luana (Filhos da Luz, evento Carlos Caetano) pediu
-- R$ 1.050,00 de repasse em 22/09 às 12h43 pelo painel do produtor. O pedido
-- entrou certo na tabela `payouts`, com a conta bancária dela junto — e ficou
-- lá, parado, sem que ninguém soubesse. Ela cobrou o Manoel por fora; foi assim
-- que a casa ficou sabendo. Conferido no banco: a tabela `payouts` só tinha o
-- gatilho de `updated_at`. Nenhum push, nenhum sino, nenhum e-mail, nenhum
-- WhatsApp. O pedido só aparecia para quem abrisse /admin/repasses por conta
-- própria.
--
-- É a mesma família do aviso de contestação (18/08): dinheiro que muda de
-- estado precisa chamar alguém, não esperar ser encontrado.
--
-- Como funciona: gatilho na `payouts` → pg_net → edge `aviso-repasse` →
-- WhatsApp do Gabriel + push no app da gestão. O que saiu fica registrado em
-- `payout_avisos`, e um cron de 10 em 10 minutos repesca o que não saiu — a
-- Evolution cai (ficou fora o dia 08/09 inteiro) e aviso perdido em silêncio é
-- exatamente o buraco que este trabalho fecha.

-- ── O registro: o que foi avisado, por onde, e o que falhou ─────────────────
create table if not exists public.payout_avisos (
  id          uuid primary key default gen_random_uuid(),
  payout_id   uuid not null references public.payouts(id) on delete cascade,
  -- 'whatsapp' (o celular do Gabriel) | 'gestao' (sino + push no app)
  canal       text not null check (canal in ('whatsapp', 'gestao')),
  -- número mascarado ou nome do destino. NUNCA o número inteiro (LGPD).
  destino     text,
  -- nulo = ainda não saiu. É este campo que a repesca olha.
  enviado_em  timestamptz,
  tentativas  integer not null default 0,
  ultimo_erro text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (payout_id, canal)
);

comment on table public.payout_avisos is
  'Prova de que o aviso de repasse saiu. Uma linha por pedido e canal; enviado_em nulo = a repesca ainda vai tentar de novo.';

create index if not exists idx_payout_avisos_pendentes
  on public.payout_avisos (payout_id) where enviado_em is null;

alter table public.payout_avisos enable row level security;

-- Quem responde pelo dinheiro vê se o aviso saiu. Mais ninguém.
drop policy if exists "admin le os avisos de repasse" on public.payout_avisos;
create policy "admin le os avisos de repasse"
  on public.payout_avisos for select
  using (public.has_role(auth.uid(), 'admin'));

-- Ninguém escreve pela chave pública: quem grava é a edge, com service role.
revoke all on public.payout_avisos from anon, authenticated;
grant select on public.payout_avisos to authenticated;

drop trigger if exists update_payout_avisos_updated_at on public.payout_avisos;
create trigger update_payout_avisos_updated_at
  before update on public.payout_avisos
  for each row execute function public.update_updated_at_column();

-- ── O gatilho ───────────────────────────────────────────────────────────────
-- REGRA DE OURO, igual à do push da gestão: falhar ao avisar NUNCA pode
-- derrubar o pedido de repasse. O produtor clicou, o pedido tem que nascer.
-- Por isso todo o corpo está dentro de um exception que só faz log.
create or replace function public.avisar_repasse_solicitado()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  _segredo text;
begin
  if new.status is distinct from 'requested' then
    return new;
  end if;

  select decrypted_secret into _segredo
    from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;

  if _segredo is null then
    raise warning '[AVISO-REPASSE] CRON_SECRET nao encontrado no Vault; aviso do payout % nao foi disparado', new.id;
    return new;
  end if;

  -- pg_net enfileira e entrega fora da transação: o insert do repasse não
  -- espera a edge responder. Timeout generoso de propósito — a Evolution é
  -- lenta quando o servidor está carregado, e desistir cedo perde o aviso.
  perform net.http_post(
    url     := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/aviso-repasse',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', _segredo
               ),
    body    := jsonb_build_object('payout_id', new.id, 'origem', 'gatilho'),
    timeout_milliseconds := 25000
  );

  return new;
exception when others then
  raise warning '[AVISO-REPASSE] gatilho falhou para o payout %: %', new.id, sqlerrm;
  return new;
end;
$fn$;

comment on function public.avisar_repasse_solicitado() is
  'Chama a edge aviso-repasse quando nasce um pedido de repasse. Nunca derruba a operação que o criou.';

drop trigger if exists trg_payouts_aviso on public.payouts;
create trigger trg_payouts_aviso
  after insert on public.payouts
  for each row execute function public.avisar_repasse_solicitado();

-- Pedido que VIRA 'requested' depois (reabertura, correção) também avisa.
drop trigger if exists trg_payouts_aviso_status on public.payouts;
create trigger trg_payouts_aviso_status
  after update of status on public.payouts
  for each row
  when (new.status = 'requested' and old.status is distinct from 'requested')
  execute function public.avisar_repasse_solicitado();

-- ── A repesca ───────────────────────────────────────────────────────────────
-- A rede de segurança. Se a Evolution estava fora do ar (08/09 ficou o dia
-- todo), se a edge caiu, se o gatilho não achou o segredo: de 10 em 10 minutos
-- a edge varre o que continua sem aviso e tenta de novo.
do $cron$
begin
  perform cron.unschedule('aviso-repasse-repescar');
exception when others then
  null; -- não existia ainda
end;
$cron$;

select cron.schedule(
  'aviso-repasse-repescar',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url     := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/aviso-repasse',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1)
               ),
    body    := jsonb_build_object('modo', 'repescar', 'origem', 'cron'),
    timeout_milliseconds := 25000
  );
  $job$
);

-- ── Consulta do ritual do "oi" ──────────────────────────────────────────────
-- Última rede, a que não depende de servidor nenhum: se tudo falhar, a pergunta
-- continua sendo feita toda manhã no chat.
create or replace function public.repasses_esperando()
returns table (
  payout_id      uuid,
  produtor       text,
  evento         text,
  valor          numeric,
  pedido_em      timestamptz,
  data_do_evento date,
  avisado_em     timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $q$
begin
  -- Mesma trava do `admin_list_payouts`: isto lista o dinheiro a pagar de TODOS
  -- os produtores. Sem esta linha, qualquer comprador logado leria a fila
  -- inteira — `security definer` passa por cima da RLS.
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select p.id,
         pp.brand_name,
         e.title,
         p.net_amount,
         p.created_at,
         e.date,
         (select max(a.enviado_em) from public.payout_avisos a where a.payout_id = p.id)
    from public.payouts p
    left join public.producer_profiles pp on pp.id = p.producer_profile_id
    left join public.events            e  on e.id  = p.event_id
   where p.status = 'requested'
   order by p.created_at;
end;
$q$;

comment on function public.repasses_esperando() is
  'Pedidos de repasse parados esperando pagamento (só admin). Usada na conferencia do "oi" — a rede que funciona mesmo com WhatsApp e push fora do ar.';

-- Só quem administra pergunta isso. A edge usa service role e passa por cima.
revoke all on function public.repasses_esperando() from public, anon;
grant execute on function public.repasses_esperando() to authenticated;

-- ── A base de repasse vira UMA função, em vez de duas cópias ────────────────
-- O aviso precisa dizer quanto o evento já vendeu e quanto ainda sobra. Isso é
-- a mesma conta que o `request_payout` faz para decidir o valor a pagar.
--
-- Copiar o filtro para dentro da edge (ou para uma terceira função) seria criar
-- mais um lugar onde a regra pode divergir — o erro que a casa já pagou em
-- 18/08 (venda manual entrando no repasse) e de novo em 02/09 (dinheiro). Por
-- isso a regra sai de dentro do `request_payout` e passa a morar aqui; o
-- `request_payout` continua idêntico em tudo o mais e agora chama esta função.
--
-- O QUE FICA DE FORA DA BASE, e por quê:
--   · cortesia  — não entrou dinheiro nenhum;
--   · manual    — o produtor recebeu na mão (PIX dele, maquininha dele);
--   · dinheiro  — a nota ficou na caixinha, nunca passou pelo nosso caixa.
create or replace function public.base_de_repasse(_event_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $base$
  select greatest(0, coalesce(sum(public.order_producer_value(o)), 0))
    from public.orders o
   where o.event_id = _event_id
     and o.status in ('paid', 'completed')
     and coalesce(o.sale_origin, 'online') not in ('courtesy', 'manual')
     and lower(coalesce(o.payment_method, '')) not in ('cash', 'dinheiro')
     and lower(coalesce(o.manual_payment_method, '')) <> 'dinheiro';
$base$;

comment on function public.base_de_repasse(uuid) is
  'O que a FestPag custodiou e deve repassar num evento. Fonte única: o request_payout e o aviso de repasse leem daqui. Fora: cortesia, venda manual e dinheiro.';

revoke all on function public.base_de_repasse(uuid) from public, anon;
grant execute on function public.base_de_repasse(uuid) to authenticated, service_role;

-- Mesma função de sempre — CREATE OR REPLACE (nunca DROP+CREATE, que devolveria
-- a permissão de execução ao público). A ÚNICA mudança é o bloco que calculava
-- `_net_revenue` na mão, agora substituído pela chamada de `base_de_repasse`.
create or replace function public.request_payout(p_event_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $rp$
DECLARE
  _event           RECORD;
  _net_revenue     numeric;
  _already_paid    numeric;
  _already_req     numeric;
  _available       numeric;
  _bank            jsonb;
  _payout_id       uuid;
BEGIN
  SELECT id, producer_id, producer_profile_id
    INTO _event
    FROM public.events
   WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  IF _event.producer_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_event_owner');
  END IF;

  _net_revenue := public.base_de_repasse(p_event_id);

  SELECT COALESCE(SUM(net_amount), 0)
    INTO _already_paid
    FROM public.payouts
   WHERE event_id = p_event_id
     AND status = 'paid';

  SELECT COALESCE(SUM(net_amount), 0)
    INTO _already_req
    FROM public.payouts
   WHERE event_id = p_event_id
     AND status = 'requested';

  _available := _net_revenue - _already_paid - _already_req;
  IF _available <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_available_balance');
  END IF;

  SELECT to_jsonb(b.*)
    INTO _bank
    FROM public.producer_bank_accounts b
   WHERE b.user_id = p_user_id
   LIMIT 1;
  IF _bank IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_bank_account');
  END IF;

  INSERT INTO public.payouts (
    producer_profile_id, event_id,
    gross_amount, platform_fee, net_amount,
    status, period_start, period_end,
    bank_account_snapshot
  ) VALUES (
    _event.producer_profile_id, p_event_id,
    _available, 0, _available,
    'requested', now(), now(),
    _bank
  )
  RETURNING id INTO _payout_id;

  RETURN jsonb_build_object('ok', true, 'payout_id', _payout_id, 'amount', _available);

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_requested');
END;
$rp$;

-- ── O retrato que vai dentro do aviso ───────────────────────────────────────
-- Serve para o WhatsApp responder sozinho a pergunta seguinte: "esse valor bate
-- com o que o evento vendeu?". Sem isso, todo aviso vira uma ida ao banco.
create or replace function public.resumo_repasse_do_evento(_event_id uuid)
returns table (
  base          numeric,  -- tudo que custodiamos e devemos a este evento
  pedidos_pagos integer,  -- quantos pedidos formam essa base
  ja_pago       numeric,  -- repasses já quitados
  ja_pedido     numeric,  -- pedidos de repasse em aberto (inclui este)
  disponivel    numeric   -- o que ainda sobra para um próximo pedido
)
language sql
stable
security definer
set search_path = public
as $resumo$
  select
    public.base_de_repasse(_event_id),
    (select count(*)::integer
       from public.orders o
      where o.event_id = _event_id
        and o.status in ('paid', 'completed')
        and coalesce(o.sale_origin, 'online') not in ('courtesy', 'manual')
        and lower(coalesce(o.payment_method, '')) not in ('cash', 'dinheiro')
        and lower(coalesce(o.manual_payment_method, '')) <> 'dinheiro'),
    (select coalesce(sum(net_amount), 0) from public.payouts where event_id = _event_id and status = 'paid'),
    (select coalesce(sum(net_amount), 0) from public.payouts where event_id = _event_id and status = 'requested'),
    greatest(0, public.base_de_repasse(_event_id)
                - (select coalesce(sum(net_amount), 0) from public.payouts where event_id = _event_id and status = 'paid')
                - (select coalesce(sum(net_amount), 0) from public.payouts where event_id = _event_id and status = 'requested'));
$resumo$;

comment on function public.resumo_repasse_do_evento(uuid) is
  'Retrato do repasse de um evento para o aviso: base custodiada, quantos pedidos, já pago, já pedido e o que sobra.';

revoke all on function public.resumo_repasse_do_evento(uuid) from public, anon;
grant execute on function public.resumo_repasse_do_evento(uuid) to authenticated, service_role;
