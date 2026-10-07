-- ============================================================================
-- REPASSE SÓ PARA CONTA DO MESMO CPF/CNPJ DA PRODUTORA (OS-157)
-- 06/10/2026
-- ============================================================================
--
-- POR QUE
--   Repassar dinheiro sem saber para quem é risco nosso. Medido em 06/10: de 13
--   produtores, 6 estavam sem CPF/CNPJ no cadastro da produtora e 6 sem conta.
--   O `request_payout` só conferia se existia uma conta qualquer, sem saber de
--   quem ela era.
--
-- O QUE O GABRIEL DECIDIU (caixinha da Linha 2, 06/10 noite e 07/10 no OK)
--   · Para pedir repasse: CPF/CNPJ da produtora com o dígito certo E uma conta
--     cadastrada com o CPF/CNPJ do titular preenchido e com o dígito certo.
--   · O titular pode ser outra pessoa (07/10: "tirar a regra do mesmo dono").
--     O que a regra garante é que sempre se sabe PARA QUEM o dinheiro vai.
--   · A trava vale no PEDIDO DE REPASSE, nunca na venda. Nada aqui toca pedido,
--     ingresso, lote ou checkout.
--
-- O QUE FAZ
--   1. `documento_valido(text)`: dígito verificador de CPF (11) e CNPJ (14).
--   2. `producer_bank_accounts.account_holder_document`: CPF/CNPJ do dono da
--      conta, só dígitos. Preenchido agora só onde a chave PIX é do tipo CPF ou
--      CNPJ (no PIX, essa chave só existe em conta daquele mesmo documento).
--   3. `pendencias_de_repasse(produtora, usuário)`: a regra num lugar só.
--      Devolve o que falta: missing_document, invalid_document,
--      no_bank_account, missing_holder_document. Vazio = pode pedir.
--   4. `minhas_pendencias_de_repasse()`: a mesma resposta para o painel do
--      produtor logado (só códigos, nenhum documento volta).
--   5. `request_payout`: chama a regra antes de abrir o pedido. CREATE OR
--      REPLACE (nunca DROP + CREATE), então a permissão continua só de
--      `service_role`, como a OS-107 deixou. O resto da função é idêntico.
--
-- O QUE NÃO MUDA
--   Valor do repasse, `base_de_repasse`, pedidos já abertos ou pagos, aviso de
--   repasse, venda. A edge `request-payout` não muda (só repassa a resposta).
--
-- COMO VOLTAR ATRÁS
--   Recriar `request_payout` como na migration 20260923150000 (bloco
--   "create or replace function public.request_payout"), depois:
--     drop function public.minhas_pendencias_de_repasse();
--     drop function public.pendencias_de_repasse(uuid, uuid);
--     alter table public.producer_bank_accounts drop column account_holder_document;
--     drop function public.documento_valido(text);
--   O retrato da conta dentro dos pedidos feitos no meio do caminho passa a ter
--   o campo a mais; não atrapalha nada.
-- ============================================================================


-- ── 1. Dígito verificador de CPF e CNPJ ─────────────────────────────────────
-- Mesma conta de src/utils/cpfValidator.ts e cnpjValidator.ts. Aceita o
-- documento com ou sem pontuação.
create or replace function public.documento_valido(_doc text)
returns boolean
language plpgsql
immutable
set search_path = public
as $dv$
declare
  d text := regexp_replace(coalesce(_doc, ''), '[^0-9]', '', 'g');
  s integer;
  r integer;
  i integer;
  w integer[];
begin
  if length(d) = 11 then
    if d = repeat(left(d, 1), 11) then return false; end if;
    s := 0;
    for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11;
    if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then return false; end if;
    s := 0;
    for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
    r := (s * 10) % 11;
    if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::int;
  elsif length(d) = 14 then
    if d = repeat(left(d, 1), 14) then return false; end if;
    w := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    s := 0;
    for i in 1..12 loop s := s + substr(d, i, 1)::int * w[i]; end loop;
    r := s % 11;
    r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::int then return false; end if;
    w := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    s := 0;
    for i in 1..13 loop s := s + substr(d, i, 1)::int * w[i]; end loop;
    r := s % 11;
    r := case when r < 2 then 0 else 11 - r end;
    return r = substr(d, 14, 1)::int;
  end if;
  return false;
end;
$dv$;

comment on function public.documento_valido(text) is
  'CPF (11) ou CNPJ (14) com dígito verificador certo. Aceita com ou sem pontuação. OS-157.';

revoke all on function public.documento_valido(text) from public, anon;
grant execute on function public.documento_valido(text) to authenticated, service_role;


-- ── 2. CPF/CNPJ do titular da conta ─────────────────────────────────────────
alter table public.producer_bank_accounts
  add column if not exists account_holder_document text;

alter table public.producer_bank_accounts
  drop constraint if exists producer_bank_accounts_holder_document_digitos;
alter table public.producer_bank_accounts
  add constraint producer_bank_accounts_holder_document_digitos
  check (account_holder_document is null
         or account_holder_document ~ '^([0-9]{11}|[0-9]{14})$');

comment on column public.producer_bank_accounts.account_holder_document is
  'CPF ou CNPJ do dono da conta, só dígitos. Sem ele (ou com dígito errado) o produtor não pede repasse (OS-157).';

-- Contas que já existem: só onde a chave PIX é CPF ou CNPJ. No PIX, essa chave
-- só pode estar numa conta daquele mesmo documento, então é o dado certo. Chave
-- de e-mail, telefone ou aleatória fica vazia: o produtor preenche na tela.
update public.producer_bank_accounts
   set account_holder_document = regexp_replace(pix_key, '[^0-9]', '', 'g')
 where account_holder_document is null
   and pix_key_type in ('cpf', 'cnpj')
   and public.documento_valido(pix_key);


-- ── 3. A regra, num lugar só ────────────────────────────────────────────────
-- Documento da produtora = producer_profiles.document do evento.
-- Conta = producer_bank_accounts do usuário dono do evento (é a que o
-- request_payout copia para o pedido).
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

comment on function public.pendencias_de_repasse(uuid, uuid) is
  'O que falta para a produtora pedir repasse: missing_document, invalid_document, no_bank_account, missing_holder_document. Vazio = pode. OS-157.';

revoke all on function public.pendencias_de_repasse(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pendencias_de_repasse(uuid, uuid) to service_role;


-- ── 4. A mesma resposta para o painel do produtor ──────────────────────────
-- Usa o usuário do token; nunca recebe "quem é" de fora. Só devolve códigos.
create or replace function public.minhas_pendencias_de_repasse()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $mp$
declare
  _uid uuid := auth.uid();
  _pp  uuid;
begin
  if _uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select pp.id into _pp
    from public.producer_profiles pp
   where pp.owner_user_id = _uid
   order by pp.created_at
   limit 1;

  if _pp is null then
    return jsonb_build_object('ok', false, 'error', 'no_producer_profile');
  end if;

  return jsonb_build_object(
    'ok', true,
    'pendencias', to_jsonb(public.pendencias_de_repasse(_pp, _uid))
  );
end;
$mp$;

revoke all on function public.minhas_pendencias_de_repasse() from public, anon;
grant execute on function public.minhas_pendencias_de_repasse() to authenticated, service_role;


-- ── 5. request_payout com a trava ───────────────────────────────────────────
-- CREATE OR REPLACE mantém a permissão (só service_role, OS-107). A única
-- mudança é o bloco "Documento e conta" antes de ler a conta.
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
  _pendencias      text[];
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

  -- Documento e conta (OS-157): sem CPF/CNPJ certo da produtora e conta com o
  -- CPF/CNPJ do titular, o pedido não nasce. Devolve a primeira pendência como
  -- `error` (a tela mostra a frase) e a lista inteira em `pendencias`.
  _pendencias := public.pendencias_de_repasse(_event.producer_profile_id, p_user_id);
  IF cardinality(_pendencias) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', _pendencias[1],
      'pendencias', to_jsonb(_pendencias)
    );
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


-- ── Conferência na própria migration ────────────────────────────────────────
DO $confere$
BEGIN
  -- Permissão do request_payout continua como a OS-107 deixou.
  IF has_function_privilege('anon', 'public.request_payout(uuid, uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.request_payout(uuid, uuid)', 'execute') THEN
    RAISE EXCEPTION 'request_payout ficou executável por anon ou authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.request_payout(uuid, uuid)', 'execute') THEN
    RAISE EXCEPTION 'request_payout ficou sem execução para service_role: a edge request-payout pararia';
  END IF;
  -- A regra não pode ser chamada de fora com usuário inventado.
  IF has_function_privilege('anon', 'public.pendencias_de_repasse(uuid, uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.pendencias_de_repasse(uuid, uuid)', 'execute') THEN
    RAISE EXCEPTION 'pendencias_de_repasse ficou executável por anon ou authenticated';
  END IF;
  -- O dígito verificador bate com o do site (CPF e CNPJ de exemplo, públicos).
  IF NOT public.documento_valido('529.982.247-25')
     OR NOT public.documento_valido('11.222.333/0001-81')
     OR public.documento_valido('529.982.247-24')
     OR public.documento_valido('11111111111')
     OR public.documento_valido('') THEN
    RAISE EXCEPTION 'documento_valido não confere com a regra do CPF/CNPJ';
  END IF;
END;
$confere$;
