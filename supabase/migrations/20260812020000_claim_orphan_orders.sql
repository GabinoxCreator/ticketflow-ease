-- Adoção de pedidos "órfãos": venda manual/portaria criada ANTES da conta existir.
-- Ao abrir Meus Ingressos, o front chama esta RPC (best-effort) e ela vincula ao
-- usuário logado os pedidos/ingressos com user_id NULL cujo e-mail E CPF batem
-- com o perfil dele.
--
-- CPF junto do e-mail é OBRIGATÓRIO: a confirmação de e-mail do signup está
-- desligada, então e-mail sozinho permitiria criar conta com e-mail alheio e
-- herdar ingressos de outra pessoa. Não relaxar sem ligar a confirmação.

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
  _order_ids uuid[];
  _tickets int := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
  END IF;

  SELECT lower(email), cpf INTO _email, _cpf FROM public.profiles WHERE id = _uid;
  IF coalesce(_email, '') = '' OR coalesce(_cpf, '') = '' THEN
    RETURN jsonb_build_object('ok', true, 'orders_claimed', 0, 'tickets_claimed', 0, 'code', 'profile_incomplete');
  END IF;

  WITH upd AS (
    UPDATE public.orders o
       SET user_id = _uid
     WHERE o.user_id IS NULL
       AND lower(o.customer_email) = _email
       AND o.customer_cpf = _cpf
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
     AND (t.holder_email IS NULL OR lower(t.holder_email) = _email);
  GET DIAGNOSTICS _tickets = ROW_COUNT;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
      _uid,
      'orphan_orders_claimed',
      'order',
      _order_ids[1],
      jsonb_build_object('order_ids', to_jsonb(_order_ids), 'tickets_claimed', _tickets)
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
