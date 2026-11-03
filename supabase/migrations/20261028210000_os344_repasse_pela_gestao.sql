-- ============================================================================
-- OS-344 · Repasse numa tela só (fase 1): a gestão LÊ os repasses do produtor com o
-- extrato e o João dá a BAIXA pela gestão, com comprovante
-- ============================================================================
-- Por que (28/10/2026): o pedido de repasse do produtor nasce aqui e apita na gestão,
-- mas a aba Pagamentos da gestão só lia a tabela `payouts` DELA. Em 28/10 09h51 o João
-- escreveu "não localizei o repasse no sistema" (Fogo & Fumaça, R$ 5.250,00). Decisão
-- do Gabriel (caixinha de 28/10): uma tela só na gestão, com o extrato embutido, e o
-- João dá a baixa lá, com comprovante, por uma porta estreita igual à do reembolso
-- (OS-112).
--
-- O que esta migration cria (NENHUMA coluna nova, nada em `payouts.notes`, que o
-- produtor lê no painel e no PDF):
--   1. gestao_repasse_extrato(payout)  a conta de UM pedido, com as conferências
--   2. gestao_repasses(status)          a lista, um extrato por pedido
--   3. gestao_repasse_pedidos(payout)   os pedidos de ingresso que formam o valor
--   4. gestao_payout_dar_baixa(...)     requested → paid, com comprovante e quem foi
-- As quatro são SÓ do servidor (service role): quem chama são as edges
-- `gestao-sales-export` (as três de leitura) e `gestao-repasse-baixa` (a baixa). O
-- produtor e o admin do site continuam vendo exatamente o que viam.
--
-- ⚠️ A base de repasse NA HORA DO PEDIDO repete o filtro de `public.base_de_repasse`
-- (cortesia, venda manual e dinheiro ficam fora). Precisa ser aqui porque aquela função
-- só conta o "agora": um pedido de 01/10 tem de ser conferido com o que o evento tinha
-- vendido em 01/10, senão toda venda que entrou depois pinta a conta de vermelho. Mudou
-- o filtro lá? Mudar aqui também (e no `resumo_repasse_do_evento`, que já repete). O
-- ensaio desta migration provou, evento a evento, que o filtro daqui sem o corte de
-- data dá exatamente `base_de_repasse` (ver a Doca da OS-344).
-- ============================================================================

-- ── 1. O extrato de UM pedido ───────────────────────────────────────────────
create or replace function public.gestao_repasse_extrato(p_payout_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $ext$
declare
  _p               public.payouts%rowtype;
  _pp              record;
  _e               record;
  _snap            jsonb;
  _ant             jsonb;
  _baixa           record;
  _hoje            date := (now() at time zone 'America/Sao_Paulo')::date;
  _momento         timestamptz;
  _fim_evento      date;
  _base_no_pedido  numeric := 0;
  _pedidos_no_ped  integer := 0;
  _base_agora      numeric := 0;
  _pagos_antes     numeric := 0;
  _repasses_antes  integer := 0;
  _comprometido    numeric := 0;
  _disponivel      numeric;
  _diferenca       numeric;
  _saldo_depois    numeric;
  _doc_produtora   text;
  _doc_titular     text;
  _pix             text;
  _pix_digitos     text;
  _conta           text;
  _ant_pix         text;
  _ant_doc         text;
  _ant_conta       text;
  _titular_bate    boolean;
  _pix_mudou       boolean;
  _adiantamento    boolean;
  _alertas         text[] := '{}';
begin
  select * into _p from public.payouts where id = p_payout_id;
  if not found then
    return null;
  end if;
  -- O momento do pedido: quando ele nasceu. Repasse lançado à mão DEPOIS de pago (com a
  -- data verdadeira do PIX em paid_at, ex.: o adiantamento da Oktoberfest de 19/08
  -- lançado em 15/10) vale pela data do pagamento.
  _momento := least(_p.created_at, coalesce(_p.paid_at, _p.created_at));

  select pp.id, pp.brand_name, pp.legal_name, pp.document
    into _pp from public.producer_profiles pp where pp.id = _p.producer_profile_id;
  select ev.id, ev.title, ev.date, ev.time, ev.end_date
    into _e from public.events ev where ev.id = _p.event_id;

  -- ── A conta: base na hora do pedido − o que já tinha sido pago = o pedido ──
  if _p.event_id is not null then
    -- ⚠️ MESMO filtro de public.base_de_repasse (ver o topo deste arquivo).
    select coalesce(sum(public.order_producer_value(o)) filter (where o.created_at <= _momento), 0),
           count(*) filter (where o.created_at <= _momento)
      into _base_no_pedido, _pedidos_no_ped
      from public.orders o
     where o.event_id = _p.event_id
       and o.status in ('paid', 'completed')
       and coalesce(o.sale_origin, 'online') not in ('courtesy', 'manual')
       and lower(coalesce(o.payment_method, '')) not in ('cash', 'dinheiro')
       and lower(coalesce(o.manual_payment_method, '')) <> 'dinheiro';
    _base_no_pedido := greatest(0, _base_no_pedido);
    _base_agora := public.base_de_repasse(_p.event_id);

    -- Pago antes: pela data em que o dinheiro saiu (paid_at), não pela data do lançamento.
    -- Repasse lançado à mão depois, com a data verdadeira do PIX (ex.: Oktoberfest, o
    -- adiantamento de 19/08 lançado em 15/10), conta no lugar certo.
    select coalesce(sum(q.net_amount), 0), count(*)
      into _pagos_antes, _repasses_antes
      from public.payouts q
     where q.event_id = _p.event_id
       and q.id <> _p.id
       and q.status = 'paid'
       and coalesce(q.paid_at, q.created_at) < _momento;

    -- Tudo o que o evento já pagou ou tem pedido, este incluído.
    select coalesce(sum(q.net_amount), 0)
      into _comprometido
      from public.payouts q
     where q.event_id = _p.event_id
       and q.status in ('paid', 'requested');

    _disponivel   := _base_no_pedido - _pagos_antes;
    _diferenca    := round(_p.net_amount - _disponivel, 2);
    _saldo_depois := round(_base_agora - _comprometido, 2);

    if abs(_diferenca) > 0.01 then _alertas := array_append(_alertas, 'conta_nao_bate'); end if;
    -- Só no pedido aberto: é o "se pagar isto, o evento fica devendo". Num pedido já pago
    -- o saldo de hoje inclui os pagamentos que vieram depois dele, e não é culpa dele.
    if _p.status = 'requested' and _saldo_depois < -0.01 then
      _alertas := array_append(_alertas, 'saldo_negativo');
    end if;
  else
    _alertas := array_append(_alertas, 'sem_evento');
  end if;

  -- ── O evento já aconteceu? Pagar antes é adiantamento ─────────────────────
  _fim_evento := coalesce(_e.end_date, _e.date);
  if _fim_evento is not null then
    _adiantamento := case
      when _p.status = 'paid' then
        (coalesce(_p.paid_at, _p.updated_at) at time zone 'America/Sao_Paulo')::date <= _fim_evento
      else _hoje <= _fim_evento
    end;
    if _adiantamento then _alertas := array_append(_alertas, 'adiantamento'); end if;
  end if;

  -- ── A conta PIX: o titular é a produtora? Mudou desde o último pagamento? ──
  _snap          := coalesce(_p.bank_account_snapshot, '{}'::jsonb);
  _doc_produtora := nullif(regexp_replace(coalesce(_pp.document, ''), '\D', '', 'g'), '');
  _doc_titular   := nullif(regexp_replace(coalesce(_snap->>'account_holder_document', ''), '\D', '', 'g'), '');
  _pix           := nullif(lower(btrim(coalesce(_snap->>'pix_key', ''))), '');
  _pix_digitos   := nullif(regexp_replace(coalesce(_pix, ''), '\D', '', 'g'), '');
  _conta         := nullif(regexp_replace(coalesce(_snap->>'agency', '') || coalesce(_snap->>'account_number', ''), '\D', '', 'g'), '');

  -- Bate quando o documento do titular é o da produtora, ou quando a chave PIX É o
  -- documento dela. Sem documento de um dos lados, não dá para dizer (nulo, não falso).
  _titular_bate := case
    when _doc_produtora is null then null
    when _doc_titular is not null then _doc_titular = _doc_produtora
    when _pix_digitos is not null and _pix_digitos = _doc_produtora then true
    else null
  end;
  if _titular_bate is false then _alertas := array_append(_alertas, 'titular_diferente'); end if;

  -- A conta do último repasse PAGO a esta produtora (qualquer evento), antes deste pedido.
  select q.bank_account_snapshot
    into _ant
    from public.payouts q
   where q.producer_profile_id = _p.producer_profile_id
     and q.id <> _p.id
     and q.status = 'paid'
     and coalesce(q.paid_at, q.created_at) < _momento
   order by coalesce(q.paid_at, q.created_at) desc
   limit 1;

  if _ant is not null then
    _ant_pix   := nullif(lower(btrim(coalesce(_ant->>'pix_key', ''))), '');
    _ant_doc   := nullif(regexp_replace(coalesce(_ant->>'account_holder_document', ''), '\D', '', 'g'), '');
    _ant_conta := nullif(regexp_replace(coalesce(_ant->>'agency', '') || coalesce(_ant->>'account_number', ''), '\D', '', 'g'), '');
    -- Só compara o que existe dos dois lados: cadastro antigo sem documento não é "mudou".
    _pix_mudou := (_pix is not null and _ant_pix is not null and _pix <> _ant_pix)
               or (_doc_titular is not null and _ant_doc is not null and _doc_titular <> _ant_doc)
               or (_pix is null and _ant_pix is null and _conta is not null and _ant_conta is not null and _conta <> _ant_conta);
    if _pix_mudou then _alertas := array_append(_alertas, 'pix_mudou'); end if;
  end if;

  -- ── Quem deu a baixa (só a casa vê; o produtor não lê audit_logs) ─────────
  select a.created_at, a.metadata
    into _baixa
    from public.audit_logs a
   where a.target_type = 'payout'
     and a.target_id = _p.id
     and a.action = 'payout_marked_paid'
   order by a.created_at desc
   limit 1;

  return jsonb_build_object(
    'id', _p.id,
    'status', _p.status,
    'valor', _p.net_amount,
    'pedido_em', _p.created_at,
    'momento_da_conta', _momento,
    'pago_em', _p.paid_at,
    'comprovante_path', _p.receipt_url,
    'produtor', jsonb_build_object(
      'id', _pp.id, 'nome', coalesce(nullif(btrim(_pp.brand_name), ''), _pp.legal_name),
      'razao_social', _pp.legal_name, 'documento', _pp.document),
    'evento', case when _e.id is null then null else jsonb_build_object(
      'id', _e.id, 'titulo', _e.title, 'data', _e.date, 'hora', _e.time, 'fim', _fim_evento) end,
    'evento_ja_aconteceu', case when _fim_evento is null then null else _fim_evento < _hoje end,
    'adiantamento', _adiantamento,
    'extrato', case when _p.event_id is null then null else jsonb_build_object(
      'base_no_pedido', _base_no_pedido,
      'pedidos_no_pedido', _pedidos_no_ped,
      'pagos_antes', _pagos_antes,
      'repasses_antes', _repasses_antes,
      'disponivel_no_pedido', round(_disponivel, 2),
      'este_pedido', _p.net_amount,
      'diferenca', _diferenca,
      'conta_bate', abs(_diferenca) <= 0.01,
      'base_agora', _base_agora,
      'vendido_depois', round(_base_agora - _base_no_pedido, 2),
      'saldo_depois', _saldo_depois) end,
    'conta', jsonb_build_object(
      'pix', _snap->>'pix_key',
      'banco', _snap->>'bank_name',
      'agencia', _snap->>'agency',
      'conta', _snap->>'account_number',
      'tipo', _snap->>'account_type',
      'titular', _snap->>'account_holder_name',
      'documento_titular', _snap->>'account_holder_document',
      'titular_bate', _titular_bate,
      'pix_mudou', _pix_mudou,
      'anterior', case when _ant is null then null else jsonb_build_object(
        'pix', _ant->>'pix_key', 'titular', _ant->>'account_holder_name',
        'documento_titular', _ant->>'account_holder_document', 'banco', _ant->>'bank_name') end),
    'alertas', to_jsonb(_alertas),
    -- Decisão do Gabriel (28/10): conta PIX ou titular que não bate pede um "pagar mesmo
    -- assim" com o motivo escrito. A baixa recusa sem o motivo (gestao_payout_dar_baixa).
    'pede_motivo', ('titular_diferente' = any(_alertas)) or ('pix_mudou' = any(_alertas)),
    'baixa', case when _baixa.created_at is null then null else jsonb_build_object(
      'em', _baixa.created_at,
      'via', coalesce(_baixa.metadata->>'via', 'site'),
      'quem', _baixa.metadata->>'quem',
      'pagar_mesmo_assim', _baixa.metadata->>'pagar_mesmo_assim',
      'nota_interna', _baixa.metadata->>'motivo') end
  );
end;
$ext$;

comment on function public.gestao_repasse_extrato(uuid) is
  'OS-344: a conta de um pedido de repasse para a gestão (base na hora do pedido − já pago = pedido), a conta PIX conferida e os alertas. Só o servidor chama.';

-- ── 2. A lista ──────────────────────────────────────────────────────────────
-- 'abertos' = esperando pagamento (requested). Os abertos primeiro, o mais novo em cima.
create or replace function public.gestao_repasses(p_status text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $lista$
  select coalesce(
           jsonb_agg(public.gestao_repasse_extrato(p.id)
                     order by (p.status = 'requested') desc, p.created_at desc),
           '[]'::jsonb)
    from public.payouts p
   where case
           when p_status is null or p_status = 'todos' then true
           when p_status = 'abertos' then p.status = 'requested'
           else p.status = p_status
         end;
$lista$;

comment on function public.gestao_repasses(text) is
  'OS-344: os pedidos de repasse com o extrato, para a aba Pagamentos da gestão (abertos, paid, requested ou todos). Só o servidor chama.';

-- ── 3. Os pedidos de ingresso que formam o valor ────────────────────────────
-- `no_pedido` = já tinha sido vendido quando o produtor pediu (entra na conta deste
-- pedido); o resto entrou depois e fica para o próximo pedido. Só o nome do comprador:
-- CPF, e-mail e telefone não saem daqui.
create or replace function public.gestao_repasse_pedidos(p_payout_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $ped$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id,
           'codigo', upper(left(o.id::text, 8)),
           'em', o.created_at,
           'comprador', o.customer_name,
           'meio', lower(coalesce(nullif(o.manual_payment_method, ''), o.payment_method, '')),
           'origem', coalesce(o.sale_origin, 'online'),
           'valor', public.order_producer_value(o),
           'no_pedido', o.created_at <= least(p.created_at, coalesce(p.paid_at, p.created_at)))
         order by o.created_at), '[]'::jsonb)
    from public.payouts p
    join public.orders o on o.event_id = p.event_id
   where p.id = p_payout_id
     -- ⚠️ MESMO filtro de public.base_de_repasse.
     and o.status in ('paid', 'completed')
     and coalesce(o.sale_origin, 'online') not in ('courtesy', 'manual')
     and lower(coalesce(o.payment_method, '')) not in ('cash', 'dinheiro')
     and lower(coalesce(o.manual_payment_method, '')) <> 'dinheiro';
$ped$;

comment on function public.gestao_repasse_pedidos(uuid) is
  'OS-344: os pedidos pagos que formam a base do evento de um repasse, marcando os que já existiam na hora do pedido. Só o servidor chama.';

-- ── 4. A baixa dada pela gestão ─────────────────────────────────────────────
-- Igual à do reembolso (OS-112): só marca um pedido `requested` como `paid`, com o
-- comprovante (obrigatório) e quem foi. Não cria pedido, não muda valor, não toca em
-- `notes`. O comprovante vai para `receipt_url`, o mesmo campo que o admin do site
-- preenche ao anexar (o produtor não vê o arquivo: o cofre `payout-proofs` é só do
-- admin). Quem deu a baixa e o "pagar mesmo assim" ficam em `audit_logs`, que o
-- produtor não lê.
create or replace function public.gestao_payout_dar_baixa(
  p_payout_id        uuid,
  p_quem             text,
  p_comprovante_path text,
  p_motivo           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $baixa$
declare
  _quem   text := nullif(left(btrim(coalesce(p_quem, '')), 200), '');
  _path   text := nullif(btrim(coalesce(p_comprovante_path, '')), '');
  _motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 500), '');
  _p      record;
  _ext    jsonb;
begin
  if _quem is null then
    return jsonb_build_object('ok', false, 'error', 'quem_obrigatorio');
  end if;
  if _path is null then
    return jsonb_build_object('ok', false, 'error', 'comprovante_obrigatorio');
  end if;

  select q.id, q.status, q.net_amount, q.event_id into _p
    from public.payouts q where q.id = p_payout_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'payout_not_found');
  end if;
  if _p.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'current_status', _p.status);
  end if;

  -- A conferência é refeita AQUI, com a linha travada: a tela pode estar velha.
  _ext := public.gestao_repasse_extrato(p_payout_id);
  if coalesce((_ext->>'pede_motivo')::boolean, false) and _motivo is null then
    return jsonb_build_object('ok', false, 'error', 'motivo_obrigatorio', 'alertas', _ext->'alertas');
  end if;

  update public.payouts
     set status = 'paid', paid_at = now(), receipt_url = _path
   where id = p_payout_id;

  -- Mesma ação da baixa feita à mão (`payout_marked_paid`), para a auditoria contar as
  -- duas juntas. `actor_id` é obrigatório e quem deu a baixa não tem usuário aqui: vai o
  -- uuid zero, e o nome de verdade vai no metadata (igual ao reembolso, OS-112).
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values ('00000000-0000-0000-0000-000000000000'::uuid, 'payout_marked_paid', 'payout', p_payout_id,
          jsonb_build_object(
            'via', 'gestao', 'quem', _quem, 'valor', _p.net_amount, 'event_id', _p.event_id,
            'comprovante_path', _path, 'alertas', _ext->'alertas',
            'pagar_mesmo_assim', case when coalesce((_ext->>'pede_motivo')::boolean, false) then _motivo end,
            'motivo', 'Baixa pela gestão (OS-344)' || case when _motivo is not null then ': ' || _motivo else '' end));

  return jsonb_build_object('ok', true, 'status', 'paid', 'pago_em', now(), 'valor', _p.net_amount);
end;
$baixa$;

comment on function public.gestao_payout_dar_baixa(uuid, text, text, text) is
  'OS-344: baixa do repasse dada pela gestão (requested → paid), com comprovante obrigatório, quem foi e o motivo quando a conta PIX ou o titular não bate. Só o servidor chama.';

-- ── Só o servidor ───────────────────────────────────────────────────────────
-- ⚠️ REVOKE FROM PUBLIC não tira anon/authenticated (grant por nome): revogar dos três.
revoke all on function public.gestao_repasse_extrato(uuid)                      from public, anon, authenticated;
revoke all on function public.gestao_repasses(text)                             from public, anon, authenticated;
revoke all on function public.gestao_repasse_pedidos(uuid)                      from public, anon, authenticated;
revoke all on function public.gestao_payout_dar_baixa(uuid, text, text, text)   from public, anon, authenticated;
grant execute on function public.gestao_repasse_extrato(uuid)                    to service_role;
grant execute on function public.gestao_repasses(text)                           to service_role;
grant execute on function public.gestao_repasse_pedidos(uuid)                    to service_role;
grant execute on function public.gestao_payout_dar_baixa(uuid, text, text, text) to service_role;
