-- ============================================================================
-- OS-417 · Trava de saque do produtor que recebeu aporte (13/11/2026)
--
-- POR QUÊ
--   O Fábio (Rosas Entreterimento) recebeu em 12/11 um aporte de R$ 5.000 que
--   se desconta dos repasses (contrato, cláusula 6.4). O painel deixa o
--   produtor pedir saque a qualquer hora e o `request_payout` não sabe de
--   aporte. Decisões do Gabriel (11/11): "a gente trava o saque dele para ele
--   não ter saque nenhum"; "a casa gera o repasse" pelo valor líquido depois
--   do evento; "botão travado, sem aviso".
--
-- O QUE MUDA
--   1. Tabela `travas_de_saque` (uma linha por produtora travada). Fechada:
--      RLS ligado, sem regra, só service_role. O produtor não consegue ler nem
--      apagar a própria trava (por isso não é coluna em producer_profiles,
--      que o dono edita).
--   2. `pendencias_de_repasse` ganha o código `saque_travado`, sempre em
--      PRIMEIRO lugar. Como o `request_payout` devolve a primeira pendência
--      como erro, o pedido é recusado no servidor sem mexer nele nem na edge.
--      O painel lê o mesmo código por `minhas_pendencias_de_repasse`.
--   3. `casa_travar_saque` e `casa_destravar_saque` (só service_role), com
--      auditoria. Travar devolve os pedidos `requested` que já existiam (não
--      cancela nada: a casa decide).
--   4. `casa_pedir_repasse(evento, valor, motivo)` (só service_role): a casa
--      abre o pedido de repasse pelo valor líquido que ela calculou (vendas
--      menos aporte e taxa). O valor não passa do disponível. O pedido segue o
--      caminho de baixa de sempre (gestao-repasse-baixa). Não escreve em
--      `payouts.notes` (o produtor lê).
--
-- O QUE NÃO MUDA
--   `request_payout`, a edge `request-payout`, `base_de_repasse` e as cópias
--   do filtro (gestao_repasse_extrato, gestao_repasse_pedidos,
--   resumo_repasse_do_evento), pedidos já abertos ou pagos. Produtora sem
--   linha em `travas_de_saque` (todas, hoje) segue igual.
--
-- DEPOIS DE APLICAR (passo do maestro, 🔜 na Doca)
--   select public.casa_travar_saque('dd84e0f6-f133-454a-8170-6c1663312c98',
--     'Aporte de R$ 5.000 (contrato de 12/11/2026): repasse gerado pela casa.');
--
-- COMO VOLTAR ATRÁS
--   Recriar `pendencias_de_repasse` como na migration 20261006230000 (bloco 3),
--   depois:
--     drop function public.casa_pedir_repasse(uuid, numeric, text);
--     drop function public.casa_destravar_saque(uuid, text);
--     drop function public.casa_travar_saque(uuid, text);
--     drop table public.travas_de_saque;
-- ============================================================================


-- ── 1. A trava ──────────────────────────────────────────────────────────────
create table if not exists public.travas_de_saque (
  producer_profile_id uuid primary key references public.producer_profiles(id) on delete cascade,
  motivo              text not null,
  travado_em          timestamptz not null default now()
);

alter table public.travas_de_saque enable row level security;
revoke all on table public.travas_de_saque from public, anon, authenticated;
grant all on table public.travas_de_saque to service_role;


-- ── 2. A trava entra como primeira pendência do repasse ─────────────────────
-- Igual à 20261006230000 (bloco 3), mais o bloco da trava no começo.
create or replace function public.pendencias_de_repasse(_producer_profile_id uuid, _user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $pr$
declare
  _p        text[] := array[]::text[];
  _doc      text;
  _tem      boolean;
  _titular  text;
begin
  -- OS-417: produtora travada pela casa não pede saque nenhum.
  if exists (select 1 from public.travas_de_saque t
              where t.producer_profile_id = _producer_profile_id) then
    _p := array_append(_p, 'saque_travado');
  end if;

  select regexp_replace(coalesce(pp.document, ''), '[^0-9]', '', 'g')
    into _doc
    from public.producer_profiles pp
   where pp.id = _producer_profile_id;

  if coalesce(_doc, '') = '' then
    _p := array_append(_p, 'missing_document');
  elsif not public.documento_valido(_doc) then
    _p := array_append(_p, 'invalid_document');
  end if;

  select true, b.account_holder_document
    into _tem, _titular
    from public.producer_bank_accounts b
   where b.user_id = _user_id
   limit 1;

  if _tem is null then
    _p := array_append(_p, 'no_bank_account');
  elsif not public.documento_valido(_titular) then
    -- Conta existe, mas sem o CPF/CNPJ do titular (ou com número errado).
    -- O titular pode ser qualquer pessoa: só não pode ficar sem saber quem é.
    _p := array_append(_p, 'missing_holder_document');
  end if;

  return _p;
end;
$pr$;

revoke all on function public.pendencias_de_repasse(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pendencias_de_repasse(uuid, uuid) to service_role;


-- ── 3. Ligar e desligar (só a casa) ─────────────────────────────────────────
create or replace function public.casa_travar_saque(_producer_profile_id uuid, _motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $tv$
declare
  _abertos jsonb;
begin
  if coalesce(btrim(_motivo), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'motivo_obrigatorio');
  end if;
  if not exists (select 1 from public.producer_profiles where id = _producer_profile_id) then
    return jsonb_build_object('ok', false, 'error', 'producer_not_found');
  end if;

  insert into public.travas_de_saque (producer_profile_id, motivo)
  values (_producer_profile_id, btrim(_motivo))
  on conflict (producer_profile_id)
  do update set motivo = excluded.motivo, travado_em = now();

  -- Pedidos já abertos não são mexidos: a casa decide o que fazer com eles.
  select coalesce(jsonb_agg(jsonb_build_object(
           'payout_id', p.id, 'event_id', p.event_id, 'valor', p.net_amount, 'pedido_em', p.created_at)), '[]'::jsonb)
    into _abertos
    from public.payouts p
   where p.producer_profile_id = _producer_profile_id
     and p.status = 'requested';

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values ('95628c4a-8040-44ed-83c5-d6a5b8793926', 'payout_lock_on', 'producer_profile', _producer_profile_id,
          jsonb_build_object('motivo', btrim(_motivo), 'pedidos_abertos', _abertos));

  return jsonb_build_object('ok', true, 'pedidos_abertos', _abertos);
end;
$tv$;

create or replace function public.casa_destravar_saque(_producer_profile_id uuid, _motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $dt$
declare
  _apagou int;
begin
  if coalesce(btrim(_motivo), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'motivo_obrigatorio');
  end if;

  delete from public.travas_de_saque where producer_profile_id = _producer_profile_id;
  get diagnostics _apagou = row_count;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values ('95628c4a-8040-44ed-83c5-d6a5b8793926', 'payout_lock_off', 'producer_profile', _producer_profile_id,
          jsonb_build_object('motivo', btrim(_motivo), 'estava_travada', _apagou > 0));

  return jsonb_build_object('ok', true, 'estava_travada', _apagou > 0);
end;
$dt$;

revoke all on function public.casa_travar_saque(uuid, text) from public, anon, authenticated;
revoke all on function public.casa_destravar_saque(uuid, text) from public, anon, authenticated;
grant execute on function public.casa_travar_saque(uuid, text) to service_role;
grant execute on function public.casa_destravar_saque(uuid, text) to service_role;


-- ── 4. A casa abre o pedido de repasse pelo valor líquido ───────────────────
-- Mesmo cálculo de disponível do request_payout; a casa escolhe o valor (até o
-- disponível). Não olha a trava nem as pendências: quem chama é a casa, que já
-- conferiu. Exige conta cadastrada (é o retrato que vai no pedido).
create or replace function public.casa_pedir_repasse(_event_id uuid, _valor numeric, _motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $cr$
declare
  _event       record;
  _disponivel  numeric;
  _bank        jsonb;
  _payout_id   uuid;
begin
  if coalesce(btrim(_motivo), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'motivo_obrigatorio');
  end if;
  if _valor is null or _valor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'valor_invalido');
  end if;

  select id, producer_id, producer_profile_id into _event
    from public.events where id = _event_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'event_not_found');
  end if;

  _disponivel := public.base_de_repasse(_event_id)
    - (select coalesce(sum(net_amount), 0) from public.payouts
        where event_id = _event_id and status in ('paid', 'requested'));
  if round(_valor, 2) > round(_disponivel, 2) then
    return jsonb_build_object('ok', false, 'error', 'valor_maior_que_disponivel',
                              'disponivel', round(_disponivel, 2));
  end if;

  select to_jsonb(b.*) into _bank
    from public.producer_bank_accounts b
   where b.user_id = _event.producer_id
   limit 1;
  if _bank is null then
    return jsonb_build_object('ok', false, 'error', 'no_bank_account');
  end if;

  insert into public.payouts (
    producer_profile_id, event_id,
    gross_amount, platform_fee, net_amount,
    status, period_start, period_end,
    bank_account_snapshot
  ) values (
    _event.producer_profile_id, _event_id,
    round(_valor, 2), 0, round(_valor, 2),
    'requested', now(), now(),
    _bank
  )
  returning id into _payout_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values ('95628c4a-8040-44ed-83c5-d6a5b8793926', 'payout_requested_by_house', 'payout', _payout_id,
          jsonb_build_object('event_id', _event_id, 'valor', round(_valor, 2),
                             'disponivel', round(_disponivel, 2), 'motivo', btrim(_motivo)));

  return jsonb_build_object('ok', true, 'payout_id', _payout_id, 'valor', round(_valor, 2),
                            'disponivel', round(_disponivel, 2));
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_requested');
end;
$cr$;

revoke all on function public.casa_pedir_repasse(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.casa_pedir_repasse(uuid, numeric, text) to service_role;
