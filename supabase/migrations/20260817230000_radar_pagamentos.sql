-- ============================================================================
-- Radar da migração de pagamentos
-- Data: 17/08/2026
--
-- PARA QUE
--   A FestPag vai virar a chave do provedor de pagamento num evento que já está
--   vendendo. Pedido do Gabriel: acompanhar de perto as vendas que saírem A
--   PARTIR do momento da virada, para conferirmos juntos no dia seguinte.
--
-- POR QUE UM GATILHO, E NÃO ANOTAR A HORA NA MÃO
--   "As vendas depois que ligamos" precisa de um instante exato. Anotado de
--   cabeça, no dia seguinte ninguém lembra se foi 9h10 ou 9h40 — e a conta sai
--   errada justamente no dia em que ela precisa estar certa. O gatilho grava
--   sozinho, junto com a FOTO do que já havia sido vendido antes: é ela que
--   permite separar depois o que é de cada rota.
--
-- O QUE O RADAR VIGIA
--   Além do volume, quatro sinais de que algo quebrou — todos com o valor
--   esperado dito na própria resposta, para quem lê não precisar saber de cor:
--     · pagos SEM ingresso   → dinheiro entrou e ingresso não saiu
--     · sem captura de venda → o repasse não vai fechar
--     · pendentes acumulando → a confirmação está falhando
--     · falhas em volume     → recusa é normal; muita recusa não é
--
-- SEGURANÇA
--   O gatilho só INSERE em audit_logs; não altera evento nem pedido. A função
--   de leitura é STABLE e não escreve nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audita_troca_de_provedor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_provider IS DISTINCT FROM OLD.payment_provider THEN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
      COALESCE(auth.uid(), '95628c4a-8040-44ed-83c5-d6a5b8793926'::uuid),
      'payment_provider_changed',
      'event',
      NEW.id,
      jsonb_build_object(
        'de', OLD.payment_provider,
        'para', NEW.payment_provider,
        'evento', NEW.title,
        'pagos_antes', (SELECT count(*) FROM orders o WHERE o.event_id = NEW.id AND o.status = 'paid'),
        'valor_antes', (SELECT COALESCE(sum(o.total_amount),0) FROM orders o WHERE o.event_id = NEW.id AND o.status = 'paid')
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audita_troca_de_provedor ON public.events;
CREATE TRIGGER trg_audita_troca_de_provedor
  AFTER UPDATE OF payment_provider ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.audita_troca_de_provedor();

CREATE OR REPLACE FUNCTION public.radar_pagamentos(_event_id uuid DEFAULT NULL)
 RETURNS TABLE(indicador text, valor text, observacao text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _ev uuid;
  _virada timestamptz;
BEGIN
  SELECT COALESCE(_event_id, (
    SELECT target_id FROM audit_logs
     WHERE action = 'payment_provider_changed'
     ORDER BY created_at DESC LIMIT 1
  )) INTO _ev;

  IF _ev IS NULL THEN
    RETURN QUERY SELECT 'sem virada registrada'::text, '—'::text,
      'Nenhum evento trocou de provedor ainda.'::text;
    RETURN;
  END IF;

  SELECT max(created_at) INTO _virada
    FROM audit_logs
   WHERE action = 'payment_provider_changed' AND target_id = _ev;

  RETURN QUERY
  SELECT 'evento',
         (SELECT title FROM events WHERE id = _ev),
         (SELECT 'provedor atual: ' || payment_provider FROM events WHERE id = _ev)
  UNION ALL
  SELECT 'virada em',
         COALESCE(to_char(timezone('America/Sao_Paulo', _virada), 'DD/MM HH24:MI'), '—'),
         'horário de Brasília'
  UNION ALL
  SELECT 'vendas DEPOIS da virada',
         (SELECT count(*)::text FROM orders WHERE event_id = _ev AND status='paid' AND created_at > _virada),
         (SELECT 'R$ ' || COALESCE(to_char(sum(total_amount),'FM999G999D00'),'0,00')
            FROM orders WHERE event_id = _ev AND status='paid' AND created_at > _virada)
  UNION ALL
  SELECT 'pela rota nova (Marcel)',
         (SELECT count(*)::text FROM orders WHERE event_id = _ev AND status='paid'
            AND created_at > _virada AND provider_transaction_id IS NOT NULL),
         'devem ser TODAS as de cima'
  UNION ALL
  SELECT '⚠ pendentes agora',
         (SELECT count(*)::text FROM orders WHERE event_id = _ev AND status='pending'),
         'pendente há muito tempo = confirmação falhando'
  UNION ALL
  SELECT '⚠ pagos SEM ingresso',
         (SELECT count(*)::text FROM orders o WHERE o.event_id = _ev AND o.status='paid'
            AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.order_id=o.id AND t.status IN ('valid','used'))),
         'tem que ser ZERO — é dinheiro entrou e ingresso não saiu'
  UNION ALL
  SELECT '⚠ falhas apos a virada',
         (SELECT count(*)::text FROM orders WHERE event_id = _ev AND status='failed' AND created_at > _virada),
         'recusa de cartão é normal; volume alto não é'
  UNION ALL
  SELECT '⚠ sem captura de venda',
         (SELECT count(*)::text FROM orders o WHERE o.event_id = _ev AND o.status='paid'
            AND o.created_at > _virada
            AND NOT EXISTS (SELECT 1 FROM order_line_face f WHERE f.order_id=o.id)),
         'tem que ser ZERO — sem isso o repasse não fecha';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.radar_pagamentos(uuid) TO authenticated;
