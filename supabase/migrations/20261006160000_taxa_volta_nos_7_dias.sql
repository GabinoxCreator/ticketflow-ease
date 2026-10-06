-- OS-144 (06/10/2026) · A taxa de serviço volta para quem desiste nos 7 dias.
--
-- Regra do Gabriel de 05/10: quem compra e desiste dentro dos 7 dias do
-- arrependimento recebe de volta o valor inteiro, ingressos e taxa. Até aqui a
-- taxa só voltava para quem tinha aceitado o texto ANTIGO da Política (versão
-- anterior a 2026-09-30), e cada pedido dos outros saía com valor menor e era
-- corrigido à mão. Em 06/10 ele mandou trocar a regra do sistema agora, sem
-- esperar a resposta do advogado: devolver mais do que o texto promete não
-- cria risco.
--
-- O que muda é uma linha, a marcada com [TAXA]. Fora da janela de 7 dias
-- (até 48 horas antes do evento) a taxa continua não voltando.
--
-- A tela do comprador (`reembolso_simular`) e o pedido (`reembolso_solicitar`)
-- leem esta mesma função, então o valor que ele vê é o valor que ele pede.
-- Pedido já feito guarda o `devolve_taxa` do dia em que foi feito: esta troca
-- não reescreve pedido antigo.
--
-- `create or replace` não mexe nos grants, mas eles são reafirmados no fim
-- para quem ler este arquivo sozinho.

create or replace function public.reembolso_regra(_order_id uuid, _agora timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $regra$
declare
  _o       record;
  _e       record;
  _forma   text;
  _inicio  timestamptz;
  _limite  timestamptz;
  _fim_arrependimento timestamptz;
  _janela  text;
  _versao  text;
  _texto_antigo boolean;
  _devolve_taxa boolean;
begin
  select o.id, o.status, o.sale_origin, o.payment_method, o.total_amount, o.created_at, o.event_id, o.user_id
    into _o
    from public.orders o
   where o.id = _order_id;
  if not found then
    return jsonb_build_object('permitido', false, 'motivo', 'pedido_nao_encontrado');
  end if;

  if _o.status <> 'paid' then
    return jsonb_build_object('permitido', false, 'motivo', 'pedido_nao_esta_pago');
  end if;

  -- Só o que a FestPag recebeu: venda manual, cortesia e maquininha da portaria
  -- foram pagas direto ao produtor (mesma fronteira da base de repasse).
  if coalesce(_o.sale_origin, 'online') <> 'online' then
    return jsonb_build_object('permitido', false, 'motivo', 'compra_fora_do_site');
  end if;

  _forma := case
    when lower(coalesce(_o.payment_method, '')) like 'pix%'  then 'pix'
    when lower(coalesce(_o.payment_method, '')) like 'card%' then 'cartao'
  end;
  if _forma is null then
    return jsonb_build_object('permitido', false, 'motivo', 'forma_de_pagamento_nao_suportada');
  end if;

  if coalesce(_o.total_amount, 0) <= 0 then
    return jsonb_build_object('permitido', false, 'motivo', 'sem_valor_pago');
  end if;

  -- Pedido com produto da loja (camiseta, combo) fica fora desta primeira
  -- versão: o produto tem retirada e estoque próprios. Vai pelo suporte.
  if exists (select 1 from public.order_product_items i where i.order_id = _order_id) then
    return jsonb_build_object('permitido', false, 'motivo', 'pedido_com_produto');
  end if;

  select e.date, e.time into _e from public.events e where e.id = _o.event_id;
  if not found or _e.date is null then
    return jsonb_build_object('permitido', false, 'motivo', 'evento_nao_encontrado');
  end if;

  -- Data e hora do evento são de Brasília (a coluna é `date` + `time`, sem fuso).
  _inicio := (_e.date + coalesce(_e.time, time '00:00')) at time zone 'America/Sao_Paulo';
  _limite := _inicio - interval '48 hours';

  -- 7 dias corridos em dias de calendário de Brasília, até o fim do 7º dia. O
  -- pedido nasce minutos antes da confirmação do pagamento; contar por dia
  -- inteiro nunca tira prazo do comprador.
  _fim_arrependimento :=
    (((_o.created_at at time zone 'America/Sao_Paulo')::date + 8)::timestamp) at time zone 'America/Sao_Paulo';

  if _agora < _fim_arrependimento and (_inicio - _agora) > interval '7 days' then
    _janela := 'arrependimento';
  elsif _agora <= _limite then
    _janela := 'ate_48h';
  else
    return jsonb_build_object(
      'permitido', false, 'motivo', 'fora_do_prazo',
      'forma', _forma, 'inicio_evento', _inicio, 'limite', _limite);
  end if;

  -- A regra que vale é a do dia da compra: a versão da Política que o
  -- comprador aceitou no pagamento.
  --
  -- ⚠️ O aceite é gravado quando a pessoa escolhe como pagar, ANTES de o pedido
  -- existir: em produção `aceites_legais.pedido_id` está sempre vazio (medido
  -- em 02/10/2026, 90 aceites de checkout, nenhum com pedido). Por isso a
  -- procura é pelo aceite da mesma pessoa mais próximo ANTES da compra. Se um
  -- dia o pedido passar a ser gravado, ele ganha.
  select a.versao into _versao
    from public.aceites_legais a
   where a.documento = 'reembolso'
     and (a.pedido_id = _order_id
          or (a.usuario_id = _o.user_id
              and a.aceito_em <= _o.created_at + interval '30 minutes'
              and a.aceito_em >= _o.created_at - interval '24 hours'))
   order by (a.pedido_id = _order_id) desc nulls last, a.aceito_em desc
   limit 1;
  -- Compra sem aceite gravado (anterior a 22/09, ou o registro falhou): vale o
  -- texto que estava no ar naquele dia. O novo entrou em 01/10/2026 às 12h25.
  if _versao is null then
    _versao := case when _o.created_at < timestamptz '2026-10-01 12:25:00-03'
                    then '2026-05-14' else '2026-09-30' end;
  end if;
  _texto_antigo := _versao < '2026-09-30';

  -- [TAXA] Desde 06/10/2026 (OS-144): a taxa volta para todo mundo que desiste
  -- nos 7 dias, aceitando o texto antigo ou o novo. Fora do arrependimento,
  -- não volta. `versao_aceita` segue no retorno, para a casa ver qual texto o
  -- comprador aceitou.
  _devolve_taxa := (_janela = 'arrependimento');

  return jsonb_build_object(
    'permitido', true,
    'janela', _janela,
    'devolve_taxa', _devolve_taxa,
    'versao_aceita', _versao,
    'forma', _forma,
    'inicio_evento', _inicio,
    'limite', _limite);
end;
$regra$;

comment on function public.reembolso_regra(uuid, timestamptz) is
  'A regra de reembolso, em um lugar só: prazo, janela e se a taxa volta. Espelha a Política de Reembolso. Mudou lá, muda aqui.';

revoke all on function public.reembolso_regra(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reembolso_regra(uuid, timestamptz) to service_role;
