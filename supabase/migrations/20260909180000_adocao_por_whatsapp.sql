-- ============================================================================
-- Sistema sem e-mail obrigatório — BLOCO 4: adoção de pedidos por CPF + WhatsApp
-- Data: 09/09/2026 · Plano: _docs/plano-login-cpf-whatsapp.md
--
-- `claim_my_orphan_orders` adota pedidos sem dono (venda manual, cortesia)
-- quando e-mail E CPF batem com o perfil. Quem só tem WhatsApp não tem e-mail
-- para bater. Passa a valer também: CPF igual E WhatsApp igual, desde que o
-- WhatsApp do perfil tenha sido CONFIRMADO por código — sem a confirmação, um
-- número digitado errado no cadastro adotaria o pedido de outra pessoa.
--
-- A regra de 12/08 continua intacta (e-mail + CPF). Só ganha um segundo caminho.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_my_orphan_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _cpf text;
  _whatsapp text;          -- normalizado, só se confirmado
  _order_ids uuid[];
  _tickets int := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
  END IF;

  SELECT NULLIF(lower(email), ''),
         NULLIF(cpf, ''),
         CASE WHEN whatsapp_confirmado_em IS NOT NULL THEN public.normalizar_whatsapp(whatsapp) END
    INTO _email, _cpf, _whatsapp
    FROM public.profiles WHERE id = _uid;

  IF _cpf IS NULL OR (_email IS NULL AND _whatsapp IS NULL) THEN
    RETURN jsonb_build_object('ok', true, 'orders_claimed', 0, 'tickets_claimed', 0, 'code', 'profile_incomplete');
  END IF;

  WITH upd AS (
    UPDATE public.orders o
       SET user_id = _uid
     WHERE o.user_id IS NULL
       AND o.customer_cpf = _cpf
       AND (
         (_email IS NOT NULL AND lower(o.customer_email) = _email)
         OR (_whatsapp IS NOT NULL AND public.normalizar_whatsapp(o.customer_phone) = _whatsapp)
       )
    RETURNING o.id
  )
  SELECT array_agg(id) INTO _order_ids FROM upd;

  IF _order_ids IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'orders_claimed', 0, 'tickets_claimed', 0);
  END IF;

  -- Ingressos dos pedidos adotados: só os do próprio comprador (holder_email
  -- igual ou vazio). Ingresso nominal de terceiro continua sem dono.
  UPDATE public.tickets t
     SET user_id = _uid
   WHERE t.user_id IS NULL
     AND t.order_id = ANY(_order_ids)
     AND (t.holder_email IS NULL OR t.holder_email = '' OR (_email IS NOT NULL AND lower(t.holder_email) = _email));
  GET DIAGNOSTICS _tickets = ROW_COUNT;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
      _uid,
      'orphan_orders_claimed',
      'order',
      _order_ids[1],
      jsonb_build_object('order_ids', to_jsonb(_order_ids), 'tickets_claimed', _tickets, 'por_whatsapp', _email IS NULL)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- auditoria nunca derruba a adoção
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'orders_claimed', coalesce(array_length(_order_ids, 1), 0),
    'tickets_claimed', _tickets
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_my_orphan_orders() FROM public;
REVOKE ALL ON FUNCTION public.claim_my_orphan_orders() FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_my_orphan_orders() TO authenticated;

-- ROLLBACK: reaplicar a versão de 20260812020000_claim_orphan_orders.sql.
