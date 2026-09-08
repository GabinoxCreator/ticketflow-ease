-- ============================================================================
-- Repasse ao produtor pelo valor de FACE do ingresso
-- Data: 08/09/2026
--
-- O QUE ESTAVA ERRADO (print do Ricardo, VI Oktoberfest, 08/09)
--   O "Repasse ao produtor" mostrava R$ 23.129,53 — número quebrado num evento
--   que só vende ingresso de R$ 200. Dois defeitos somados:
--
--   1. JURO DE PARCELA NO BOLSO DO PRODUTOR. Na rota do Marcel o cartão
--      parcelado grava em `orders.total_amount` o valor COM juro, e a taxa de
--      conveniência (`service_fee_amount`) é calculada antes do juro. A conta
--      antiga do repasse era `total_amount − service_fee_amount`, então 100% do
--      juro caía como "valor do ingresso". Na Oktoberfest: +R$ 279,53 em 9
--      vendas. Ver _docs/investigacao-juro-parcelamento-repasse.md.
--
--   2. VENDA MANUAL DENTRO DO REPASSE. A correção de 02/09 tirou só o DINHEIRO.
--      A venda manual paga por PIX/cartão/"outro" continuava entrando — e esse
--      dinheiro nunca passou pela FestPag: o produtor recebeu direto. Regra do
--      Gabriel de 18/08/2026 (Cofre → Decisões: "Repasse só sobre o dinheiro
--      que passou pelo nosso caixa"). Na Oktoberfest: R$ 3.600 a mais.
--
-- O QUE MUDA
--   · `order_producer_value(orders)` — a FÓRMULA ÚNICA do valor do ingresso de
--     um pedido, para o produtor. Se a venda tem valor de face gravado
--     (`order_line_face`, capturado no ato desde 17/08), vale
--         face − desconto de cupom
--     e o juro fica de fora. Se não tem (venda antiga, Mercado Pago, manual),
--     vale a conta de sempre: `total_amount − service_fee_amount` — que nessas
--     rotas é exatamente a face, porque nelas não há juro embutido.
--   · `producer_order_values(uuid[])` — a mesma fórmula, em lote, para o painel
--     do produtor (que não enxerga `order_line_face` por RLS). Só devolve
--     pedidos de eventos do próprio chamador (ou admin).
--   · `request_payout` passa a usar a fórmula e a deixar a venda manual de fora,
--     junto com o dinheiro. Tela e pagamento contam a mesma história.
--
-- O QUE NÃO MUDA
--   · Nenhum pedido é alterado. Nenhuma coluna nova. `payouts` já pagos ficam
--     como estão (repasse é máquina de estados, não se reescreve).
--   · Lote com `modo_taxa = 'absorve'` (a taxa sai de DENTRO da face): a conta
--     antiga dava face (a taxa não é somada ao total nesse modo); a nova dá o
--     mesmo. O desconto da taxa absorvida é assunto do motor de repasse do
--     Rodeio (§6), não deste conserto. [A CONFIRMAR com o Gabriel]
--
-- COMO VOLTAR ATRÁS
--   Reaplicar a versão de `request_payout` de 20260902120000 e DROP das duas
--   funções novas. O front volta sozinho à conta antiga se a RPC sumir? Não —
--   ele falha alto de propósito (número errado com cara de certo é pior que
--   tela sem número). Por isso o front só sobe DEPOIS desta migration.
-- ============================================================================

-- 1) A fórmula única -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_producer_value(o public.orders)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    -- Face gravada no ato da venda: o juro de parcela não está aqui.
    (SELECT SUM(f.unit_face * f.quantity) FROM public.order_line_face f WHERE f.order_id = o.id)
      - COALESCE(o.discount_amount, 0),
    -- Sem face gravada: rotas sem juro embutido — total − taxa É a face.
    COALESCE(o.total_amount, 0) - COALESCE(o.service_fee_amount, 0)
  );
$function$;

COMMENT ON FUNCTION public.order_producer_value(public.orders) IS
  'Valor do ingresso de um pedido para o PRODUTOR (sem taxa de conveniência e sem juro de parcela). Fórmula única: usada por request_payout e pelo painel (producer_order_values).';

REVOKE ALL ON FUNCTION public.order_producer_value(public.orders) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_producer_value(public.orders) TO authenticated, service_role;

-- 2) A mesma fórmula, em lote, para o painel do produtor -----------------------
CREATE OR REPLACE FUNCTION public.producer_order_values(p_order_ids uuid[])
RETURNS TABLE (order_id uuid, producer_value numeric, face_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT o.id,
         public.order_producer_value(o),
         (SELECT SUM(f.unit_face * f.quantity) FROM public.order_line_face f WHERE f.order_id = o.id)
    FROM public.orders o
   WHERE o.id = ANY (p_order_ids)
     AND (
       EXISTS (SELECT 1 FROM public.events e WHERE e.id = o.event_id AND e.producer_id = auth.uid())
       OR public.has_role(auth.uid(), 'admin'::app_role)
     );
$function$;

COMMENT ON FUNCTION public.producer_order_values(uuid[]) IS
  'Valor do ingresso para o produtor, por pedido, em lote. Só pedidos de eventos do chamador (ou admin). face_amount vem nulo quando a venda não tem face gravada.';

REVOKE ALL ON FUNCTION public.producer_order_values(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.producer_order_values(uuid[]) TO authenticated, service_role;

-- 3) request_payout: mesma fórmula; manual e dinheiro fora ---------------------
--    O RESTO DA FUNÇÃO É IDÊNTICO ao que estava em produção (20260902120000).
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

  -- Base do repasse = valor de face dos ingressos que passaram pelo NOSSO caixa.
  SELECT GREATEST(0, COALESCE(SUM(public.order_producer_value(o)), 0))
    INTO _net_revenue
    FROM public.orders o
   WHERE o.event_id = p_event_id
     AND o.status IN ('paid', 'completed')
     -- Cortesia não é receita; venda MANUAL o produtor recebeu direto (18/08).
     AND COALESCE(o.sale_origin, 'online') NOT IN ('courtesy', 'manual')
     -- Dinheiro fora: já ficou com quem vendeu (02/09).
     AND lower(coalesce(o.payment_method, '')) NOT IN ('cash', 'dinheiro')
     AND lower(coalesce(o.manual_payment_method, '')) <> 'dinheiro';

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
