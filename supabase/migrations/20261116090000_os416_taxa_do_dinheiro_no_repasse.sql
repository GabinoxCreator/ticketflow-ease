-- OS-416 (16/11/2026): a taxa cobrada no DINHEIRO sai do repasse sozinha.
--
-- Desde a OS-412 (decisão do Gabriel de 09/11/2026), quem paga em dinheiro na
-- maquininha paga o ingresso + a taxa do evento, como no cartão e no Pix. Só que
-- o dinheiro inteiro, taxa junto, fica na mão do produtor no ato da venda, e o
-- repasse já tirava o pedido em dinheiro inteiro da base (regra de 02/09/2026).
-- Sem esta migration, a taxa do dinheiro ficaria com o produtor e só sairia à mão,
-- no fechamento (como as 8 vendas sem taxa do Fogo, decisão de 09/11).
--
-- 1) `taxa_do_dinheiro_do_pedido(pedido)`: num pedido pago (`paid`/`completed`)
--    em dinheiro NA MAQUININHA (`sale_origin` 'smartpos' e `payment_method`
--    'cash'; decisão do Gabriel de 16/11, "Só a maquininha": a venda manual em
--    dinheiro fica como antes, fora do repasse inteira e sem desconto de taxa),
--    é o que o produtor tem na mão além do que é dele:
--    `total_amount − order_producer_value(pedido)`, nunca negativo.
--      · lote normal: dá a `service_fee_amount` (no dinheiro não há juro);
--      · lote "Sem taxa" (decisão do Gabriel de 16/11, "Porta segue o lote"): o
--        comprador paga só a face e a `order_producer_value` já tira a taxa
--        absorvida (face cheia × `order_line_face.taxa_absorvida_pct`, OS-426);
--        a diferença é exatamente essa taxa. Assim a taxa sai do produtor uma vez
--        só, pela mesma regra e pelos mesmos dados do site, sem mexer em
--        `order_producer_value`.
--    `taxa_do_dinheiro(evento, até)` soma isso por evento; `até` corta pela hora
--    do pedido (a conta da gestão na hora do pedido de repasse). Só service_role.
--    CONTRATO para a maquininha vender lote "Sem taxa" (ordem própria, na
--    Entrada, OS-432): nas linhas de lote "Sem taxa" nada de taxa por cima
--    (`service_fee_amount` leva só a taxa das linhas de lote normal; é 0 só no
--    pedido todo "Sem taxa"), e uma linha em `order_line_face` por lote com
--    `unit_face`, `quantity` e `taxa_absorvida_pct` PREENCHIDO (no dinheiro, o
--    percentual do Pix, a regra da OS-412). Cobrar a taxa por cima E gravar o
--    percentual cobraria duas vezes. O pedido segue com `sale_origin` 'smartpos'
--    e `payment_method` 'cash' (o que a confirmação já grava): é por eles que
--    esta conta reconhece o dinheiro da maquininha.
--    ⚠️ Se um dia o pedido em dinheiro puder ser reembolsado (hoje
--    `reembolso_regra` recusa), esta conta precisa mudar: a
--    `order_producer_value` tira o ingresso reembolsado e a taxa subiria.
-- 2) `base_de_repasse`: a base de antes MENOS a taxa do dinheiro. A trava em
--    zero continua só na soma do que passou pelo nosso caixa; depois do desconto
--    a base pode ficar negativa de propósito: se a taxa do dinheiro passar do que
--    entrou online, o produtor deve a diferença à casa, o pedido de saque é
--    recusado (`no_available_balance`) e o painel do produtor mostra quanto ele
--    deve (decisão do Gabriel de 16/11, "Mostrar aos dois"). A gestão só mostra
--    "o evento já recebeu a mais" quando o evento já tem pedido de repasse (o
--    extrato é por pedido); o aviso à equipe sem pedido é ordem própria (Entrada
--    16/11). Com a trava, essa dívida sumiria sem aviso.
--    Quem lê `base_de_repasse` passa a enxergar o desconto sem mudar nada:
--    `request_payout`, `resumo_repasse_do_evento` (e as edges `aviso-repasse` e
--    `aviso-reembolso`, que leem o resumo), `admin_reembolsos_listar`, a edge
--    `gestao-sales-export` e, na OS-417, `casa_pedir_repasse`.
-- 3) `gestao_repasse_extrato` e `gestao_repasse_pedidos` repetem o filtro da
--    base (aviso do CLAUDE.md do site): a base na hora do pedido desconta a mesma
--    taxa, e a lista "pedidos que formam o valor" mostra cada pedido em dinheiro
--    com taxa como uma linha NEGATIVA (`taxa_do_dinheiro: true`), para a soma da
--    lista bater com a base.
-- 4) `admin_platform_net` (painel da casa): a taxa do dinheiro da maquininha sai
--    de `gross` (não está na mão da FestPag) e vem separada em `cashFee`.
-- 5) `reembolso_valores`: pedido em dinheiro da maquininha devolve taxa 0. A casa nunca teve
--    essa taxa na mão. (Hoje `reembolso_regra` já recusa reembolso de pedido da
--    maquininha e da venda manual, `compra_fora_do_site`, e de pagamento em
--    dinheiro; isto é a segunda trava, e o que `reembolso_simular` mostra.)
--
-- `order_producer_value` (OS-426) e `request_payout` (OS-417) NÃO mudam.
-- Em 16/11/2026: 10 pedidos pagos em dinheiro na maquininha, todos com taxa 0 e
-- sem `order_line_face`, e nenhuma venda manual com taxa: nenhum repasse do ar muda
-- de valor com esta migration. O primeiro caso nasce quando a OS-412 subir (as
-- duas sobem juntas, esta ANTES do redeploy da `collaborator-reserve-order`).
--
-- Voltar atrás: rodar `_docs/os416/voltar-atras.sql` (na raiz do workspace): as
-- 5 definições do ar em 16/11/2026 08h, com o corpo igual byte a byte ao do ar
-- (md5 do prosrc conferido), e `drop function` das duas funções novas. Se a edge
-- da OS-412 já subiu, voltar a edge ANTES.

-- 1) A taxa do dinheiro de um pedido e de um evento -------------------------
create or replace function public.taxa_do_dinheiro_do_pedido(o public.orders)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- O que o produtor tem na mão além do que é dele. Lote normal: a taxa que o
  -- comprador pagou. Lote "Sem taxa": a taxa que a order_producer_value já tira
  -- da face. Fora do dinheiro da maquininha (inclusive venda manual), 0.
  select case
           when o.status in ('paid', 'completed')
            and coalesce(o.sale_origin, 'online') = 'smartpos'
            and lower(coalesce(o.payment_method, '')) in ('cash', 'dinheiro')
           then greatest(0, coalesce(o.total_amount, 0) - public.order_producer_value(o))
           else 0
         end;
$function$;

revoke all on function public.taxa_do_dinheiro_do_pedido(public.orders) from public, anon, authenticated;
grant execute on function public.taxa_do_dinheiro_do_pedido(public.orders) to service_role;

comment on function public.taxa_do_dinheiro_do_pedido(public.orders) is
  'OS-416: num pedido pago em dinheiro, total_amount menos order_producer_value (nunca negativo): a taxa do comprador no lote normal, a taxa absorvida no lote Sem taxa. Fica com o produtor e sai do repasse.';

create or replace function public.taxa_do_dinheiro(_event_id uuid, _ate timestamptz default null)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(sum(public.taxa_do_dinheiro_do_pedido(o)), 0)
    from public.orders o
   where o.event_id = _event_id
     and o.status in ('paid', 'completed')
     and coalesce(o.sale_origin, 'online') = 'smartpos'
     and lower(coalesce(o.payment_method, '')) in ('cash', 'dinheiro')
     and (_ate is null or o.created_at <= _ate);
$function$;

revoke all on function public.taxa_do_dinheiro(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.taxa_do_dinheiro(uuid, timestamptz) to service_role;

comment on function public.taxa_do_dinheiro(uuid, timestamptz) is
  'OS-416: taxa das vendas em dinheiro de um evento (fica na mão do produtor e sai do repasse): soma taxa_do_dinheiro_do_pedido; _ate corta pela hora do pedido.';

-- 2) A base de repasse desconta a taxa do dinheiro ---------------------------
create or replace function public.base_de_repasse(_event_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- O que passou pelo nosso caixa (como antes), menos a taxa que o comprador
  -- pagou em dinheiro e ficou com o produtor (OS-416). Pode dar negativo: é a
  -- dívida do produtor com a casa.
  select greatest(0, coalesce(sum(public.order_producer_value(o)), 0))
         - public.taxa_do_dinheiro(_event_id)
    from public.orders o
   where o.event_id = _event_id
     and o.status in ('paid', 'completed')
     and coalesce(o.sale_origin, 'online') not in ('courtesy', 'manual')
     and lower(coalesce(o.payment_method, '')) not in ('cash', 'dinheiro')
     and lower(coalesce(o.manual_payment_method, '')) <> 'dinheiro';
$function$;

-- 3a) Extrato do pedido de repasse (gestão) -----------------------------------
create or replace function public.gestao_repasse_extrato(p_payout_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
  _taxa_din_ped    numeric := 0;
  _taxa_din_agora  numeric := 0;
  _pedidos_din     integer := 0;
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
  _momento := least(_p.created_at, coalesce(_p.paid_at, _p.created_at));
  select pp.id, pp.brand_name, pp.legal_name, pp.document
    into _pp from public.producer_profiles pp where pp.id = _p.producer_profile_id;
  select ev.id, ev.title, ev.date, ev.time, ev.end_date
    into _e from public.events ev where ev.id = _p.event_id;
  if _p.event_id is not null then
    select coalesce(sum(public.order_producer_value(o)) filter (where o.created_at <= _momento), 0),
           count(*) filter (where o.created_at <= _momento)
      into _base_no_pedido, _pedidos_no_ped
      from public.orders o
     where o.event_id = _p.event_id
       and o.status in ('paid', 'completed')
       and coalesce(o.sale_origin, 'online') not in ('courtesy', 'manual')
       and lower(coalesce(o.payment_method, '')) not in ('cash', 'dinheiro')
       and lower(coalesce(o.manual_payment_method, '')) <> 'dinheiro';
    -- OS-416: a taxa cobrada no dinheiro até a hora do pedido sai da base, como
    -- em `base_de_repasse`. Os pedidos em dinheiro com taxa entram na contagem
    -- porque `gestao_repasse_pedidos` os lista (linha negativa).
    _taxa_din_ped   := public.taxa_do_dinheiro(_p.event_id, _momento);
    _taxa_din_agora := public.taxa_do_dinheiro(_p.event_id);
    select count(*)
      into _pedidos_din
      from public.orders o
     where o.event_id = _p.event_id
       and o.status in ('paid', 'completed')
       and coalesce(o.sale_origin, 'online') <> 'courtesy'
       and public.taxa_do_dinheiro_do_pedido(o) > 0
       and o.created_at <= _momento;
    _base_no_pedido := greatest(0, _base_no_pedido) - _taxa_din_ped;
    _pedidos_no_ped := _pedidos_no_ped + _pedidos_din;
    _base_agora := public.base_de_repasse(_p.event_id);
    select coalesce(sum(q.net_amount), 0), count(*)
      into _pagos_antes, _repasses_antes
      from public.payouts q
     where q.event_id = _p.event_id
       and q.id <> _p.id
       and q.status = 'paid'
       and coalesce(q.paid_at, q.created_at) < _momento;
    select coalesce(sum(q.net_amount), 0)
      into _comprometido
      from public.payouts q
     where q.event_id = _p.event_id
       and q.status in ('paid', 'requested');
    _disponivel   := _base_no_pedido - _pagos_antes;
    _diferenca    := round(_p.net_amount - _disponivel, 2);
    _saldo_depois := round(_base_agora - _comprometido, 2);
    if abs(_diferenca) > 0.01 then _alertas := array_append(_alertas, 'conta_nao_bate'); end if;
    if _p.status = 'requested' and _saldo_depois < -0.01 then
      _alertas := array_append(_alertas, 'saldo_negativo');
    end if;
  else
    _alertas := array_append(_alertas, 'sem_evento');
  end if;
  _fim_evento := coalesce(_e.end_date, _e.date);
  if _fim_evento is not null then
    _adiantamento := case
      when _p.status = 'paid' then
        (coalesce(_p.paid_at, _p.updated_at) at time zone 'America/Sao_Paulo')::date <= _fim_evento
      else _hoje <= _fim_evento
    end;
    if _adiantamento then _alertas := array_append(_alertas, 'adiantamento'); end if;
  end if;
  _snap          := coalesce(_p.bank_account_snapshot, '{}'::jsonb);
  _doc_produtora := nullif(regexp_replace(coalesce(_pp.document, ''), '\D', '', 'g'), '');
  _doc_titular   := nullif(regexp_replace(coalesce(_snap->>'account_holder_document', ''), '\D', '', 'g'), '');
  _pix           := nullif(lower(btrim(coalesce(_snap->>'pix_key', ''))), '');
  _pix_digitos   := nullif(regexp_replace(coalesce(_pix, ''), '\D', '', 'g'), '');
  _conta         := nullif(regexp_replace(coalesce(_snap->>'agency', '') || coalesce(_snap->>'account_number', ''), '\D', '', 'g'), '');
  _titular_bate := case
    when _doc_produtora is null then null
    when _doc_titular is not null then _doc_titular = _doc_produtora
    when _pix_digitos is not null and _pix_digitos = _doc_produtora then true
    else null
  end;
  if _titular_bate is false then _alertas := array_append(_alertas, 'titular_diferente'); end if;
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
    _pix_mudou := (_pix is not null and _ant_pix is not null and _pix <> _ant_pix)
               or (_doc_titular is not null and _ant_doc is not null and _doc_titular <> _ant_doc)
               or (_pix is null and _ant_pix is null and _conta is not null and _ant_conta is not null and _conta <> _ant_conta);
    if _pix_mudou then _alertas := array_append(_alertas, 'pix_mudou'); end if;
  end if;
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
      'taxa_do_dinheiro_no_pedido', _taxa_din_ped,
      'taxa_do_dinheiro_agora', _taxa_din_agora,
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
    'pede_motivo', ('titular_diferente' = any(_alertas)) or ('pix_mudou' = any(_alertas)),
    'baixa', case when _baixa.created_at is null then null else jsonb_build_object(
      'em', _baixa.created_at,
      'via', coalesce(_baixa.metadata->>'via', 'site'),
      'quem', _baixa.metadata->>'quem',
      'pagar_mesmo_assim', _baixa.metadata->>'pagar_mesmo_assim',
      'nota_interna', _baixa.metadata->>'motivo') end
  );
end;
$function$;

-- 3b) Os pedidos que formam o valor (gestão) ----------------------------------
create or replace function public.gestao_repasse_pedidos(p_payout_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(x.linha order by x.em), '[]'::jsonb)
    from (
      -- O que passou pelo nosso caixa: valor do ingresso para o produtor.
      select o.created_at as em,
             jsonb_build_object(
               'id', o.id,
               'codigo', upper(left(o.id::text, 8)),
               'em', o.created_at,
               'comprador', o.customer_name,
               'meio', lower(coalesce(nullif(o.manual_payment_method, ''), o.payment_method, '')),
               'origem', coalesce(o.sale_origin, 'online'),
               'valor', public.order_producer_value(o),
               'no_pedido', o.created_at <= least(p.created_at, coalesce(p.paid_at, p.created_at))) as linha
        from public.payouts p
        join public.orders o on o.event_id = p.event_id
       where p.id = p_payout_id
         and o.status in ('paid', 'completed')
         and coalesce(o.sale_origin, 'online') not in ('courtesy', 'manual')
         and lower(coalesce(o.payment_method, '')) not in ('cash', 'dinheiro')
         and lower(coalesce(o.manual_payment_method, '')) <> 'dinheiro'
      union all
      -- OS-416: a taxa cobrada no dinheiro ficou com o produtor e sai do repasse.
      select o.created_at,
             jsonb_build_object(
               'id', o.id,
               'codigo', upper(left(o.id::text, 8)),
               'em', o.created_at,
               'comprador', o.customer_name,
               'meio', lower(coalesce(nullif(o.manual_payment_method, ''), o.payment_method, '')),
               'origem', coalesce(o.sale_origin, 'online'),
               'valor', - public.taxa_do_dinheiro_do_pedido(o),
               'taxa_do_dinheiro', true,
               'no_pedido', o.created_at <= least(p.created_at, coalesce(p.paid_at, p.created_at)))
        from public.payouts p
        join public.orders o on o.event_id = p.event_id
       where p.id = p_payout_id
         and o.status in ('paid', 'completed')
         and coalesce(o.sale_origin, 'online') <> 'courtesy'
         and public.taxa_do_dinheiro_do_pedido(o) > 0
    ) x;
$function$;

-- 4) Painel da casa: a taxa do dinheiro separada ------------------------------
create or replace function public.admin_platform_net()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare _gross numeric; _cost numeric; _cash numeric;
begin
  if not public.has_role(auth.uid(),'admin'::app_role) then
    raise exception 'not_admin' using errcode='42501';
  end if;
  -- OS-416: a taxa das vendas em dinheiro da maquininha não está na mão da
  -- FestPag (fica com o produtor e sai do repasse): vem separada em cashFee,
  -- fora de gross e net. Venda manual em dinheiro fica como antes (em gross).
  select coalesce(sum(o.service_fee_amount) filter (where not (
             coalesce(o.sale_origin, 'online') = 'smartpos'
             and lower(coalesce(o.payment_method, '')) in ('cash', 'dinheiro'))), 0),
         coalesce(sum(public.taxa_do_dinheiro_do_pedido(o)) filter (where
             coalesce(o.sale_origin, 'online') = 'smartpos'
             and lower(coalesce(o.payment_method, '')) in ('cash', 'dinheiro')), 0)
    into _gross, _cash
    from public.orders o where o.status='paid';
  with pay as (
    select distinct on (w.mp_payment_id) w.order_id,
      (select coalesce(sum((e->>'amount')::numeric),0)
         from jsonb_array_elements(w.payload->'fee_details') e
         where e->>'type'='mercadopago_fee') as mp_fee
    from public.mp_webhook_events w
    where w.mp_payment_id is not null
    order by w.mp_payment_id, w.processed_at desc)
  select coalesce(sum(p.mp_fee),0) into _cost
    from pay p join public.orders o on o.id = p.order_id and o.status='paid';
  return jsonb_build_object('gross',_gross,'mpCost',_cost,'net',_gross-_cost,'cashFee',_cash);
end; $function$;

-- 5) Reembolso: pedido em dinheiro não devolve taxa como se fosse da casa -------
create or replace function public.reembolso_valores(_order_id uuid)
returns table(ticket_id uuid, valor_ingresso numeric, valor_taxa numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with pedido as (
    select o.id,
           round(greatest(0, public.order_producer_value_bruto(o)) * 100)::bigint as ingressos_cent,
           -- A taxa que o COMPRADOR pagou. Quando o produtor absorve a taxa, o
           -- comprador não pagou nada além do ingresso e não há taxa a discutir.
           -- OS-416: no dinheiro da maquininha a taxa ficou com o produtor (sai do
           -- repasse), a casa nunca a teve: não entra no que a casa devolve.
           case
             when coalesce(o.sale_origin, 'online') = 'smartpos'
                  and lower(coalesce(o.payment_method, '')) in ('cash', 'dinheiro') then 0::bigint
             else round(greatest(0, least(coalesce(o.service_fee_amount, 0),
                                          coalesce(o.total_amount, 0) - public.order_producer_value_bruto(o))) * 100)::bigint
           end as taxa_cent
      from public.orders o
     where o.id = _order_id
  ),
  t as (
    select tk.id,
           coalesce(
             (select max(f.unit_face) from public.order_line_face f
               where f.order_id = tk.order_id and f.lot_id = tk.lot_id),
             l.price,
             0)::numeric as peso
      from public.tickets tk
      left join public.event_lots l on l.id = tk.lot_id
     where tk.order_id = _order_id
       and tk.status <> 'pending'
  ),
  s as (select coalesce(sum(peso), 0) as soma, count(*) as n from t),
  p as (
    -- Sem preço de face conhecido (mesa, pedido antigo): reparte por igual.
    select t.id,
           case when s.soma > 0 then t.peso / s.soma else 1.0 / nullif(s.n, 0) end as w
      from t, s
  ),
  c as (
    select p.id,
           floor(pedido.ingressos_cent * p.w)                                as ing_base,
           pedido.ingressos_cent * p.w - floor(pedido.ingressos_cent * p.w)  as ing_resto,
           floor(pedido.taxa_cent * p.w)                                     as taxa_base,
           pedido.taxa_cent * p.w - floor(pedido.taxa_cent * p.w)            as taxa_resto,
           pedido.ingressos_cent, pedido.taxa_cent
      from p, pedido
  ),
  d as (
    select c.*,
           row_number() over (order by c.ing_resto desc, c.id)  as ing_ordem,
           row_number() over (order by c.taxa_resto desc, c.id) as taxa_ordem,
           c.ingressos_cent - sum(c.ing_base) over ()           as ing_sobra,
           c.taxa_cent - sum(c.taxa_base) over ()               as taxa_sobra
      from c
  )
  select d.id,
         ((d.ing_base  + case when d.ing_ordem  <= d.ing_sobra  then 1 else 0 end) / 100.0)::numeric(12,2),
         ((d.taxa_base + case when d.taxa_ordem <= d.taxa_sobra then 1 else 0 end) / 100.0)::numeric(12,2)
    from d;
$function$;
