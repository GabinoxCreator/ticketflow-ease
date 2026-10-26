-- OS-317 (26/10/2026): ingresso em dupla volta inteiro no reembolso.
--
-- Decisão do Gabriel em 26/10: "dupla só se devolve inteira". O lote em grupo
-- (`event_lots.group_ticket_enabled`) passou a emitir N ingressos por compra,
-- cada um com face = preço do grupo ÷ N. Sem esta trava, o comprador marcava 1
-- dos 2 ingressos e recebia a metade do par, ficando com um ingresso mais
-- barato que o lote comum, e o lote ficava com um ingresso solto.
--
-- O que muda:
--   * reembolso_solicitar: recusa ('grupo_inteiro') quando, num lote em grupo,
--     a quantidade escolhida não é múltipla do grupo. Mesmo lugar da regra da
--     mesa ('mesa_inteira').
--   * reembolso_simular: cada ingresso leva 'grupo' (N, ou 1) e 'lot_id', para
--     a tela marcar a dupla junta. Nada mais muda na resposta.
-- O resto das duas funções é cópia fiel do que está no ar (conferido por md5
-- do corpo em 26/10: idêntico a 20261002070000_reembolso_pela_conta.sql).
-- Sem mudança de assinatura: as permissões (authenticated, service_role)
-- continuam as mesmas.

create or replace function public.reembolso_simular(_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $sim$
declare
  _uid   uuid := auth.uid();
  _dono  uuid;
  _regra jsonb;
  _mesa  boolean;
  _ingressos jsonb;
  _aberto jsonb;
begin
  if _uid is null then
    return jsonb_build_object('permitido', false, 'motivo', 'nao_autenticado');
  end if;

  select o.user_id into _dono from public.orders o where o.id = _order_id;
  if not found or _dono is distinct from _uid then
    return jsonb_build_object('permitido', false, 'motivo', 'pedido_nao_e_seu');
  end if;

  _regra := public.reembolso_regra(_order_id);

  select exists (select 1 from public.tickets t where t.order_id = _order_id and t.event_seat_id is not null)
    into _mesa;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ticket_id', t.id,
           'codigo', upper(left(t.ticket_code, 8)),
           'titular', t.holder_name,
           'nome', coalesce(l.name, s.label, 'Ingresso'),
           'motivo', public.reembolso_motivo_do_ingresso(t.id, _dono),
           'valor_ingresso', v.valor_ingresso,
           'valor_taxa', v.valor_taxa,
           -- Lote em grupo (OS-317): quantos ingressos formam a dupla. A tela
           -- usa para marcar a dupla junta; quem cumpre a regra é o solicitar.
           'grupo', case when l.group_ticket_enabled and l.group_ticket_quantity >= 2
                         then l.group_ticket_quantity else 1 end,
           'lot_id', t.lot_id
         ) order by coalesce(s.label, t.ticket_code)), '[]'::jsonb)
    into _ingressos
    from public.tickets t
    join public.reembolso_valores(_order_id) v on v.ticket_id = t.id
    left join public.event_lots l on l.id = t.lot_id
    left join public.event_seats s on s.id = t.event_seat_id
   where t.order_id = _order_id;

  select jsonb_build_object('id', r.id, 'numero', r.numero, 'solicitado_em', r.solicitado_em)
    into _aberto
    from public.reembolsos r
   where r.order_id = _order_id and r.status = 'solicitado'
   limit 1;

  -- Mesa é vendida inteira e volta inteira. Com algum lugar já usado, não há
  -- como devolver a mesa.
  if (_regra->>'permitido')::boolean and _mesa and exists (
       select 1 from public.tickets t
        where t.order_id = _order_id and t.status <> 'pending'
          and public.reembolso_motivo_do_ingresso(t.id, _dono) is not null) then
    _regra := jsonb_build_object('permitido', false, 'motivo',
                case when _aberto is not null then 'reembolso_em_analise' else 'mesa_indisponivel' end)
              || jsonb_build_object('forma', _regra->'forma', 'limite', _regra->'limite');
  end if;

  return _regra || jsonb_build_object(
    'mesa', _mesa,
    'ingressos', _ingressos,
    'pedido_aberto', _aberto);
end;
$sim$;

create or replace function public.reembolso_solicitar(
  _order_id       uuid,
  _ticket_ids     uuid[],
  _chave_pix      text default null,
  _tipo_chave_pix text default null,
  _motivo         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $sol$
declare
  _uid    uuid := auth.uid();
  _o      record;
  _regra  jsonb;
  _ids    uuid[];
  _n      int;
  _mesa   boolean;
  _forma  text;
  _chave  text;
  _tipo   text;
  _motivo_limpo text;
  _devolve_taxa boolean;
  _v_ing  numeric(12,2);
  _v_taxa numeric(12,2);
  _total  numeric(12,2);
  _id     uuid;
  _numero bigint;
begin
  if _uid is null then
    return jsonb_build_object('ok', false, 'error', 'nao_autenticado');
  end if;

  -- A trava do pedido põe em fila dois cliques simultâneos na mesma compra.
  select o.id, o.user_id, o.event_id into _o
    from public.orders o
   where o.id = _order_id
   for update;
  if not found or _o.user_id is distinct from _uid then
    return jsonb_build_object('ok', false, 'error', 'pedido_nao_e_seu');
  end if;

  _regra := public.reembolso_regra(_order_id);
  if not (_regra->>'permitido')::boolean then
    return jsonb_build_object('ok', false, 'error', _regra->>'motivo', 'limite', _regra->'limite');
  end if;
  _forma := _regra->>'forma';
  _devolve_taxa := (_regra->>'devolve_taxa')::boolean;

  select array_agg(distinct x) into _ids from unnest(coalesce(_ticket_ids, '{}'::uuid[])) as x where x is not null;
  if _ids is null or array_length(_ids, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'nenhum_ingresso_escolhido');
  end if;

  if exists (select 1 from public.reembolsos r where r.order_id = _order_id and r.status = 'solicitado') then
    return jsonb_build_object('ok', false, 'error', 'reembolso_em_analise');
  end if;

  -- Pedir e desistir em sequência dispara aviso para a casa a cada vez.
  if (select count(*) from public.reembolsos r where r.order_id = _order_id) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'limite_de_pedidos');
  end if;

  -- Trava os ingressos escolhidos: nenhum check-in passa no meio deste pedido.
  select count(*) into _n
    from (select t.id from public.tickets t
           where t.id = any(_ids) and t.order_id = _order_id
           for update) travados;
  if _n <> array_length(_ids, 1) then
    return jsonb_build_object('ok', false, 'error', 'ingresso_invalido');
  end if;

  if exists (select 1 from unnest(_ids) as x
              where public.reembolso_motivo_do_ingresso(x, _uid) is not null) then
    return jsonb_build_object('ok', false, 'error', 'ingresso_indisponivel',
      'detalhe', (select jsonb_agg(jsonb_build_object('ticket_id', x, 'motivo', public.reembolso_motivo_do_ingresso(x, _uid)))
                    from unnest(_ids) as x
                   where public.reembolso_motivo_do_ingresso(x, _uid) is not null));
  end if;

  -- Mesa volta inteira: todos os lugares do pedido, juntos.
  select exists (select 1 from public.tickets t where t.order_id = _order_id and t.event_seat_id is not null)
    into _mesa;
  if _mesa and exists (select 1 from public.tickets t
                        where t.order_id = _order_id and t.status <> 'pending' and not (t.id = any(_ids))) then
    return jsonb_build_object('ok', false, 'error', 'mesa_inteira');
  end if;

  -- Lote em grupo volta inteiro (OS-317, decisão do Gabriel em 26/10/2026:
  -- "dupla só se devolve inteira"). Em cada lote em grupo do pedido, a
  -- quantidade devolvida tem de ser múltipla do grupo: quem tem 2 duplas pode
  -- devolver 1 dupla inteira, nunca meia. Meia dupla deixaria um ingresso por
  -- metade do preço do par e um ingresso solto no lote.
  if exists (select 1
               from public.tickets t
               join public.event_lots l on l.id = t.lot_id
              where t.id = any(_ids)
                and l.group_ticket_enabled and l.group_ticket_quantity >= 2
              group by l.id, l.group_ticket_quantity
             having count(*) % l.group_ticket_quantity <> 0) then
    return jsonb_build_object('ok', false, 'error', 'grupo_inteiro');
  end if;

  if _forma = 'pix' then
    _chave := nullif(btrim(coalesce(_chave_pix, '')), '');
    _tipo  := nullif(lower(btrim(coalesce(_tipo_chave_pix, ''))), '');
    if _chave is null or length(_chave) < 5 or length(_chave) > 140 then
      return jsonb_build_object('ok', false, 'error', 'chave_pix_invalida');
    end if;
    if _tipo is null or _tipo not in ('cpf','cnpj','email','telefone','aleatoria') then
      return jsonb_build_object('ok', false, 'error', 'tipo_de_chave_invalido');
    end if;
  end if;

  _motivo_limpo := nullif(left(btrim(coalesce(_motivo, '')), 500), '');

  select coalesce(sum(v.valor_ingresso), 0), coalesce(sum(v.valor_taxa), 0)
    into _v_ing, _v_taxa
    from public.reembolso_valores(_order_id) v
   where v.ticket_id = any(_ids);

  _total := _v_ing + case when _devolve_taxa then _v_taxa else 0 end;
  if _total <= 0 then
    return jsonb_build_object('ok', false, 'error', 'sem_valor_pago');
  end if;

  insert into public.reembolsos
    (order_id, event_id, user_id, valor_ingressos, valor_taxa, devolve_taxa, valor_a_devolver,
     regra, forma, chave_pix, tipo_chave_pix, motivo)
  values
    (_order_id, _o.event_id, _uid, _v_ing, _v_taxa, _devolve_taxa, _total,
     _regra, _forma, _chave, _tipo, _motivo_limpo)
  returning id, numero into _id, _numero;

  insert into public.reembolso_ingressos (reembolso_id, ticket_id, valor_ingresso, valor_taxa)
  select _id, v.ticket_id, v.valor_ingresso, v.valor_taxa
    from public.reembolso_valores(_order_id) v
   where v.ticket_id = any(_ids);

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (_uid, 'refund_requested', 'order', _order_id,
          jsonb_build_object('reembolso_id', _id, 'numero', _numero, 'ingressos', array_length(_ids, 1),
                             'valor_a_devolver', _total, 'janela', _regra->>'janela', 'forma', _forma));

  return jsonb_build_object(
    'ok', true, 'reembolso_id', _id, 'numero', _numero,
    'valor_a_devolver', _total, 'valor_ingressos', _v_ing, 'valor_taxa', _v_taxa,
    'devolve_taxa', _devolve_taxa, 'forma', _forma);
end;
$sol$;
