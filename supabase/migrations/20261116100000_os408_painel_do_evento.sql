-- OS-408 etapa 4 (16/11/2026) · painel do produtor: totais e listas em páginas, lidos no banco.
--
-- Até aqui o painel do evento trazia TODOS os pedidos e TODOS os ingressos de uma vez
-- e contava o tamanho da lista. A API do banco devolve no máximo um teto de linhas por
-- consulta (padrão do Supabase: 1.000), então num evento maior o painel mostraria
-- números menores, calado, e o "Exportar" sairia faltando gente.
--
-- Três funções SÓ DE LEITURA, com as regras de leitura de quem chama (SECURITY INVOKER,
-- RLS): o produtor vê aqui exatamente o que já via lendo `orders` e `tickets` direto
-- (dono do evento; pedido em conferência da casa continua escondido).
--
--  · painel_evento_totais(evento): os números dos cartões (pedidos, pagos, pendentes,
--    cancelados, não concluídos, com problema, vendido e ingressos). "Vendido" é a MESMA
--    conta do painel (src/lib/producerFinance.ts, `computeProducerFinance().total`):
--    pedidos pagos, sem cortesia, pelo valor do ingresso para o produtor que o banco já
--    calcula (`order_producer_value`, só chamada aqui, nunca recriada). Nenhuma conta muda.
--  · painel_evento_pedidos(evento, situação, busca): a lista de pedidos, para ler em
--    páginas (o painel pede 50 por vez; o "Exportar" pede blocos de 500 até acabar).
--  · painel_evento_ingressos(evento, situação, busca): a lista de participantes, com a
--    mesma regra de hoje (ingresso cancelado de tentativa vencida ou recusada não conta).
--
-- Sem estas funções no ar, a tela cai na conta antiga (lê tudo em blocos e conta no
-- navegador) e não quebra. Ordem de subida: esta migration antes da tela.
--
-- Volta atrás:
--   drop function public.painel_evento_totais(uuid);
--   drop function public.painel_evento_pedidos(uuid, text, text);
--   drop function public.painel_evento_ingressos(uuid, text, text);

create or replace function public.painel_evento_totais(_event_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with pedidos as (
    select o.status,
           o.review_status,
           case
             when o.status in ('paid', 'completed') and coalesce(o.sale_origin, 'online') <> 'courtesy'
               then coalesce(public.order_producer_value(o), o.total_amount - coalesce(o.service_fee_amount, 0))
           end as vendido
      from public.orders o
     where o.event_id = _event_id
  ),
  ingressos as (
    select t.status
      from public.tickets t
      left join public.orders o on o.id = t.order_id
     where t.event_id = _event_id
       and t.status in ('valid', 'used', 'cancelled')
       and not (t.status = 'cancelled' and coalesce(o.status, '') in ('expired', 'failed'))
  )
  select jsonb_build_object(
    'pedidos',              (select count(*) from pedidos),
    'pagos',                (select count(*) from pedidos where status in ('paid', 'completed')),
    'pendentes',            (select count(*) from pedidos where status = 'pending'),
    'cancelados',           (select count(*) from pedidos where status in ('cancelled', 'refunded', 'charged_back')),
    'nao_concluidos',       (select count(*) from pedidos where status in ('expired', 'failed')),
    'com_problema',         (select count(*) from pedidos where review_status is not null),
    'vendido',              (select coalesce(sum(vendido), 0) from pedidos),
    'ingressos',            (select count(*) from ingressos),
    'ingressos_validos',    (select count(*) from ingressos where status = 'valid'),
    'ingressos_usados',     (select count(*) from ingressos where status = 'used'),
    'ingressos_cancelados', (select count(*) from ingressos where status = 'cancelled')
  );
$$;

create or replace function public.painel_evento_pedidos(
  _event_id uuid,
  _situacao text default 'todos',
  _busca text default null
)
returns setof public.orders
language sql
stable
security invoker
set search_path = public
as $$
  select o.*
    from public.orders o
    cross join lateral (
      -- busca por pedaço do nome, do e-mail ou do telefone; % e _ digitados valem como letra
      select '%' || replace(replace(replace(nullif(btrim(coalesce(_busca, '')), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as padrao
    ) b
   where o.event_id = _event_id
     and case coalesce(_situacao, 'todos')
           when 'todos'          then true
           when 'pagos'          then o.status in ('paid', 'completed')
           when 'pendentes'      then o.status = 'pending'
           when 'cancelados'     then o.status in ('cancelled', 'refunded', 'charged_back')
           when 'nao_concluidos' then o.status in ('expired', 'failed')
           else false
         end
     and (b.padrao is null
          or o.customer_name ilike b.padrao
          or o.customer_email ilike b.padrao
          or coalesce(o.customer_phone, '') ilike b.padrao)
   order by o.created_at desc, o.id desc;
$$;

create or replace function public.painel_evento_ingressos(
  _event_id uuid,
  _situacao text default 'todos',
  _busca text default null
)
returns setof public.tickets
language sql
stable
security invoker
set search_path = public
as $$
  select t.*
    from public.tickets t
    left join public.orders o on o.id = t.order_id
    cross join lateral (
      select '%' || replace(replace(replace(nullif(btrim(coalesce(_busca, '')), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as padrao
    ) b
   where t.event_id = _event_id
     and t.status in ('valid', 'used', 'cancelled')
     -- tentativa (PIX que venceu, cartão recusado) não é ingresso cancelado: nunca foi paga
     and not (t.status = 'cancelled' and coalesce(o.status, '') in ('expired', 'failed'))
     and case coalesce(_situacao, 'todos')
           when 'todos'      then true
           when 'validos'    then t.status = 'valid'
           when 'usados'     then t.status = 'used'
           when 'cancelados' then t.status = 'cancelled'
           else false
         end
     and (b.padrao is null
          or t.holder_name ilike b.padrao
          or coalesce(t.holder_email, '') ilike b.padrao
          or t.ticket_code ilike b.padrao)
   order by t.created_at desc, t.id desc;
$$;

revoke all on function public.painel_evento_totais(uuid) from public, anon;
revoke all on function public.painel_evento_pedidos(uuid, text, text) from public, anon;
revoke all on function public.painel_evento_ingressos(uuid, text, text) from public, anon;
grant execute on function public.painel_evento_totais(uuid) to authenticated;
grant execute on function public.painel_evento_pedidos(uuid, text, text) to authenticated;
grant execute on function public.painel_evento_ingressos(uuid, text, text) to authenticated;

comment on function public.painel_evento_totais(uuid) is
  'OS-408: números dos cartões do painel do evento (pedidos por situação, vendido, ingressos). Só leitura, com a RLS de quem chama.';
comment on function public.painel_evento_pedidos(uuid, text, text) is
  'OS-408: pedidos do evento por situação (todos, pagos, pendentes, cancelados, nao_concluidos) e busca, para ler em páginas. Só leitura, com a RLS de quem chama.';
comment on function public.painel_evento_ingressos(uuid, text, text) is
  'OS-408: ingressos do evento por situação (todos, validos, usados, cancelados) e busca, para ler em páginas. Só leitura, com a RLS de quem chama.';
