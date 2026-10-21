-- OS-265 (21/10/2026): o produtor não mexe mais no dinheiro do próprio pedido.
--
-- O QUE ESTAVA ABERTO (varredura de 17/10, B4)
--   As regras "Produtores podem atualizar pedidos de seus eventos" e
--   "Produtores podem atualizar ingressos de seus eventos" deixavam o dono do
--   evento dar UPDATE em QUALQUER coluna dos próprios pedidos e ingressos, sem
--   WITH CHECK: total, taxa, desconto, status, ids de pagamento, dono. Com isso
--   ele inflava o "disponível" do repasse (que a casa paga à mão), marcava pedido
--   como pago (o que dispara ingresso no WhatsApp e "compra" na Meta),
--   ressuscitava ingresso cancelado ou reembolsado e trocava o dono do ingresso.
--   E como as rotinas que promovem a pago confiam no id de pagamento gravado no
--   pedido, trocar esse id liberava pedido com pagamento de outro (E10).
--
-- O QUE MUDA
--   1. As duas regras de UPDATE do produtor saem. Pedido e ingresso passam a ser
--      escritos só pelo servidor (edges com a chave de serviço) e pelas funções da
--      casa (SECURITY DEFINER), como já era para o cliente e para o admin.
--   2. anon e authenticated perdem o UPDATE nas duas tabelas (segunda trava: se
--      alguém criar uma regra de UPDATE por engano, a escrita continua recusada).
--      Conferido em 21/10: nenhuma função SECURITY INVOKER escreve ou trava
--      (FOR UPDATE) pedido ou ingresso, e nenhuma edge escreve com o login do
--      usuário. service_role e as funções da casa seguem iguais.
--   3. O que o produtor fazia de legítimo no ingresso pela tabela (check-in na
--      lista de participantes, desfazer o check-in, cancelar um ingresso) passa
--      pela função produtor_mudar_ingresso, que confere o dono do evento e só
--      aceita essas três passagens:
--        validar             valid -> used   (pedido pago)
--        desfazer_validacao  used  -> valid  (pedido pago)
--        cancelar            valid | used -> cancelled
--      Ingresso cancelado não volta; pendente (pedido não pago) não vira nada.
--      Pedido: o produtor não tinha nenhuma escrita legítima direta (venda manual,
--      cancelamento e cortesia já são edges e funções da casa), então nada novo.
--
--   4. Pedido que a conferência de pagamento das edges mandou para análise
--      (`review_reason.flavor = 'c_conferencia'`: o provedor diz pago, mas o id
--      do pagamento é de outro pedido ou o valor não bate) só a casa vê
--      (decisão do Gabriel, 21/10/2026). O produtor deixa de ver o pedido e os
--      ingressos dele enquanto a bandeira estiver lá: o painel mostraria "Pago
--      sem entrega... Fale com a FestPag para devolver o valor", que não é o
--      caso. Os outros "pago sem entrega" seguem visíveis como hoje. A casa
--      (admin) e o comprador do próprio pedido seguem vendo.
--
-- Fica para outra ordem (não é deste arquivo): regras de `events` e do storage
-- (OS-266) e o `events.payment_provider`, que o produtor ainda muda.
--
-- Como voltar atrás: bloco comentado no fim do arquivo.

-- 1. Sai o UPDATE livre do produtor -----------------------------------------
DROP POLICY IF EXISTS "Produtores podem atualizar pedidos de seus eventos" ON public.orders;
DROP POLICY IF EXISTS "Produtores podem atualizar ingressos de seus eventos" ON public.tickets;

-- 2. Segunda trava: sem UPDATE para quem entra pela API pública ----------------
REVOKE UPDATE ON TABLE public.orders FROM anon, authenticated;
REVOKE UPDATE ON TABLE public.tickets FROM anon, authenticated;

-- 3. O que o produtor ainda faz no ingresso ------------------------------------
CREATE OR REPLACE FUNCTION public.produtor_mudar_ingresso(_ticket_id uuid, _acao text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _t record;
  _novo text;
  _validado timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado' USING ERRCODE = '42501';
  END IF;
  IF _acao IS NULL OR _acao NOT IN ('validar', 'desfazer_validacao', 'cancelar') THEN
    RAISE EXCEPTION 'acao_invalida' USING ERRCODE = '22023';
  END IF;

  -- Trava a linha do ingresso: duas telas abertas não passam uma por cima da outra.
  SELECT t.id, t.status, t.validated_at, t.order_id, t.event_id,
         e.producer_id, o.status AS pedido_status,
         coalesce(o.review_reason->>'flavor', '') AS bandeira
    INTO _t
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.orders o ON o.id = t.order_id
   WHERE t.id = _ticket_id
   FOR UPDATE OF t;

  -- Mesma porta da regra antiga: só o dono do evento. Ingresso de outro evento,
  -- ou de pedido em conferência (que só a casa vê, item 4), responde igual a
  -- ingresso que não existe (não confirma que o id existe).
  IF NOT FOUND OR _t.producer_id IS DISTINCT FROM _uid OR _t.bandeira = 'c_conferencia' THEN
    RAISE EXCEPTION 'ingresso_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF _acao = 'validar' THEN
    IF _t.status <> 'valid' OR _t.pedido_status <> 'paid' THEN
      RAISE EXCEPTION 'passagem_nao_permitida:%:%', _t.status, _t.pedido_status USING ERRCODE = '22023';
    END IF;
    _novo := 'used';
    _validado := now();
  ELSIF _acao = 'desfazer_validacao' THEN
    IF _t.status <> 'used' OR _t.pedido_status <> 'paid' THEN
      RAISE EXCEPTION 'passagem_nao_permitida:%:%', _t.status, _t.pedido_status USING ERRCODE = '22023';
    END IF;
    _novo := 'valid';
    _validado := NULL;
  ELSE -- cancelar
    IF _t.status NOT IN ('valid', 'used') THEN
      RAISE EXCEPTION 'passagem_nao_permitida:%:%', _t.status, _t.pedido_status USING ERRCODE = '22023';
    END IF;
    _novo := 'cancelled';
    _validado := _t.validated_at;
  END IF;

  -- O gatilho trg_tickets_barrar_em_reembolso segue valendo aqui: ingresso com
  -- reembolso em análise não faz check-in.
  UPDATE public.tickets
     SET status = _novo,
         validated_at = _validado
   WHERE id = _ticket_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (_uid, 'produtor_mudou_ingresso', 'ticket', _ticket_id,
          jsonb_build_object('acao', _acao, 'de', _t.status, 'para', _novo,
                             'order_id', _t.order_id, 'event_id', _t.event_id));

  RETURN jsonb_build_object('id', _ticket_id, 'status', _novo, 'validated_at', _validado);
END;
$$;

-- No Supabase, anon e authenticated ganham EXECUTE próprio em função nova: tirar
-- do PUBLIC não basta (lição da B7, cancel_manual_order).
REVOKE ALL ON FUNCTION public.produtor_mudar_ingresso(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produtor_mudar_ingresso(uuid, text) TO authenticated;

-- 4. Pedido em conferência só a casa vê -----------------------------------------
-- No pedido, a regra lê a própria linha. No ingresso, a regra precisa olhar o
-- pedido, e a regra do pedido já o esconde do produtor: por isso a pergunta passa
-- por uma função que enxerga o pedido (SECURITY DEFINER) e só responde sim/não.
CREATE OR REPLACE FUNCTION public._pedido_so_da_casa(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
     WHERE id = _order_id
       AND review_reason->>'flavor' = 'c_conferencia'
  );
$$;
REVOKE ALL ON FUNCTION public._pedido_so_da_casa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._pedido_so_da_casa(uuid) TO authenticated;

ALTER POLICY "Produtores podem ver pedidos de seus eventos" ON public.orders
  USING (
    EXISTS (SELECT 1 FROM public.events
             WHERE events.id = orders.event_id AND events.producer_id = auth.uid())
    AND coalesce(orders.review_reason->>'flavor', '') <> 'c_conferencia'
  );

-- Ingresso: a regra passa a valer só para quem está logado (`authenticated`). Era
-- `public`, mas sem login `auth.uid()` é nulo e ela nunca deixou ver nada; assim o
-- visitante sem login não esbarra na função nova (que não é dele).
ALTER POLICY "Produtores podem ver ingressos de seus eventos" ON public.tickets
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.events
             WHERE events.id = tickets.event_id AND events.producer_id = auth.uid())
    AND NOT public._pedido_so_da_casa(tickets.order_id)
  );

-- Como voltar atrás (devolve o buraco da B4; só se algo legítimo quebrar):
-- GRANT UPDATE ON TABLE public.orders TO anon, authenticated;
-- GRANT UPDATE ON TABLE public.tickets TO anon, authenticated;
-- CREATE POLICY "Produtores podem atualizar pedidos de seus eventos" ON public.orders
--   FOR UPDATE USING (EXISTS (SELECT 1 FROM public.events
--     WHERE events.id = orders.event_id AND events.producer_id = auth.uid()));
-- CREATE POLICY "Produtores podem atualizar ingressos de seus eventos" ON public.tickets
--   FOR UPDATE USING (EXISTS (SELECT 1 FROM public.events
--     WHERE events.id = tickets.event_id AND events.producer_id = auth.uid()));
-- DROP FUNCTION IF EXISTS public.produtor_mudar_ingresso(uuid, text);
-- ALTER POLICY "Produtores podem ver pedidos de seus eventos" ON public.orders
--   USING (EXISTS (SELECT 1 FROM public.events
--     WHERE events.id = orders.event_id AND events.producer_id = auth.uid()));
-- ALTER POLICY "Produtores podem ver ingressos de seus eventos" ON public.tickets
--   TO public USING (EXISTS (SELECT 1 FROM public.events
--     WHERE events.id = tickets.event_id AND events.producer_id = auth.uid()));
-- DROP FUNCTION IF EXISTS public._pedido_so_da_casa(uuid);
-- (a tela da lista de participantes volta a funcionar pelas duas regras; a
-- função pode ficar, ela não abre nada.)
