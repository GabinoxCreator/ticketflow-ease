-- Dinheiro fica FORA do repasse ao produtor (decisão do Gabriel, 02/09/2026).
--
-- POR QUÊ: venda recebida em espécie nunca passou pela FestPag — o dinheiro ficou
-- com quem vendeu, na hora. Somá-la ao repasse faria a FestPag pagar ao produtor
-- um dinheiro que ele já tem no bolso. Nasceu com a venda de ingresso na
-- maquininha, que é a primeira rota de ingresso a aceitar espécie, mas a regra
-- vale para qualquer origem.
--
-- O QUE MUDA: `request_payout` deixa de somar os pedidos pagos em dinheiro.
-- O dinheiro continua CONTADO e visível no painel do produtor (ele precisa ver o
-- que vendeu) — só não entra no valor a receber. A mesma regra vive em
-- `src/lib/producerFinance.ts`; as duas precisam contar a mesma história.
--
-- ONDE O DADO MORA: a maquininha grava `payment_method = 'cash'`; a venda manual
-- grava a forma em `manual_payment_method = 'dinheiro'`. Por isso as duas portas.
--
-- EFEITO SOBRE O QUE JÁ EXISTE: nenhum. Em 02/09/2026 não há um único pedido pago
-- em dinheiro no banco (conferido) — nenhum repasse já solicitado ou pago muda de
-- valor. A partir daqui, o que entrar em espécie nasce fora da conta.
--
-- O RESTO DA FUNÇÃO É IDÊNTICO ao que estava em produção.

CREATE OR REPLACE FUNCTION public.request_payout(p_event_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT GREATEST(0,
           COALESCE(SUM(total_amount), 0) - COALESCE(SUM(service_fee_amount), 0))
    INTO _net_revenue
    FROM public.orders
   WHERE event_id = p_event_id
     AND status IN ('paid', 'completed')
     AND sale_origin <> 'courtesy'
     -- Dinheiro fora: já ficou com quem vendeu.
     AND lower(coalesce(payment_method, '')) NOT IN ('cash', 'dinheiro')
     AND lower(coalesce(manual_payment_method, '')) <> 'dinheiro';

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
$function$;
