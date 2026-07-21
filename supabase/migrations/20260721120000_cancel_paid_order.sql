-- ============================================================================
-- cancel_paid_order — cascata de cancelamento de pedido PAGO (online/manual)
--
-- ⚠️ PREPARADO, NÃO ATIVADO. Esta migration NÃO deve ser aplicada durante o
--    evento em produção. Rodar manualmente no SQL Editor SOMENTE APÓS o evento
--    25/07 e após validar em homologação. Não há caso real hoje (0 refunded,
--    0 charged_back). Nada no webhook chama esta função ainda (o ponto de
--    chamada está escrito e COMENTADO em supabase/functions/mercadopago-webhook).
--
-- Fecha o gap: hoje paid → refunded/charged_back só troca status e loga
-- 'manual_inventory_review', deixando sold_quantity inflado e tickets 'valid'
-- (ainda validáveis na portaria). Esta RPC faz, transacionalmente:
--   1) devolve estoque (mesa: release_seats_for_order; ingresso: sold_quantity−);
--   2) tickets valid/pending → cancelled;
--   3) orders.status → status alvo (NUNCA deleta — só transição);
--   4) reverte uso do cupom.
--
-- Espelha a cancel_manual_order (20260525151902), mas SEM a trava sale_origin
-- e aceitando os status terminais de estorno. Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_paid_order(
  _order_id      uuid,
  _target_status text,           -- 'cancelled' | 'refunded' | 'charged_back'
  _reason        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _order   RECORD;
  _is_mesa boolean;
  _lot     RECORD;
BEGIN
  IF _target_status NOT IN ('cancelled','refunded','charged_back') THEN
    RAISE EXCEPTION 'invalid_target_status:%', _target_status USING ERRCODE = '22023';
  END IF;

  SELECT id, status, sale_origin, coupon_id, event_id
    INTO _order
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotência: já no estado terminal alvo → não muta nada
  IF _order.status = _target_status THEN
    RETURN jsonb_build_object('ok', true, 'already_applied', true);
  END IF;

  -- Só cancela pedido PAGO. Estados não-pagos têm fluxos próprios
  -- (expire-pending-orders, webhook rejected). Não reprocessar aqui.
  IF _order.status NOT IN ('paid','completed') THEN
    RAISE EXCEPTION 'invalid_status:%', _order.status USING ERRCODE = '22023';
  END IF;

  -- Mesa vs ingresso: detecta por tickets.event_seat_id (imutável),
  -- nunca por event_seats.order_id (é zerado pelo release).
  SELECT EXISTS (
    SELECT 1 FROM public.tickets
     WHERE order_id = _order_id AND event_seat_id IS NOT NULL
  ) INTO _is_mesa;

  -- 1) Devolve estoque
  IF _is_mesa THEN
    PERFORM public.release_seats_for_order(_order_id);
  ELSE
    FOR _lot IN
      SELECT lot_id, count(*)::int AS qty
        FROM public.tickets
       WHERE order_id = _order_id
         AND status IN ('valid','pending')
         AND lot_id IS NOT NULL
       GROUP BY lot_id
    LOOP
      UPDATE public.event_lots
         SET sold_quantity = GREATEST(0, sold_quantity - _lot.qty)
       WHERE id = _lot.lot_id;
    END LOOP;
  END IF;

  -- 2) Tickets → cancelled (não existe status 'expired' para ticket)
  UPDATE public.tickets
     SET status = 'cancelled'
   WHERE order_id = _order_id
     AND status IN ('valid','pending');

  -- 3) Pedido → status alvo (transição, nunca DELETE)
  UPDATE public.orders
     SET status = _target_status, updated_at = now()
   WHERE id = _order_id;

  -- 4) Reverte uso do cupom
  IF _order.coupon_id IS NOT NULL THEN
    UPDATE public.event_coupons
       SET uses_count = GREATEST(0, uses_count - 1),
           updated_at = now()
     WHERE id = _order.coupon_id;
  END IF;

  -- Auditoria (SYSTEM_ACTOR — mesmo usado pelas edges)
  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES ('95628c4a-8040-44ed-83c5-d6a5b8793926', 'paid_order_cancelled', 'order', _order_id,
          jsonb_build_object('target_status', _target_status, 'reason', _reason, 'is_mesa', _is_mesa));

  RETURN jsonb_build_object('ok', true, 'already_applied', false, 'is_mesa', _is_mesa);
END $$;

-- Só service_role executa (chamada a partir do webhook/edge, nunca do client).
REVOKE ALL ON FUNCTION public.cancel_paid_order(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_paid_order(uuid, text, text) TO service_role;
