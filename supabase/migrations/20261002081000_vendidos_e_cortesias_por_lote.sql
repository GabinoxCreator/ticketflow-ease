-- Vendidos e cortesias por lote, contados nos ingressos de verdade. OS-108, 02/10/2026.
--
-- POR QUE: o painel do produtor mostrava como "vendidos" o contador do lote
-- (`event_lots.sold_quantity`), que soma CORTESIA e pode ficar com sobra quando
-- uma venda cancelada não devolve o estoque (5ª Confra do Bem: o contador diz 248;
-- de verdade são 242 pagos + 5 cortesias). Decisão do Gabriel em 02/10/2026:
-- cortesia não conta como vendido, aparece à parte ("242 vendidos · 5 cortesias").
--
-- O QUE CONTA:
--   vendidos  = ingresso válido ou usado, de pedido pago, que não é cortesia;
--   cortesias = ingresso válido ou usado, de pedido pago, de origem cortesia.
-- O contador `sold_quantity` continua sendo o controle de estoque; esta função
-- só responde "quanto foi vendido" para a tela.
--
-- POR QUE NO BANCO: a tela recebe a contagem pronta, em vez de baixar ingresso por
-- ingresso (a leitura direta para em 1.000 linhas e o número sairia errado em
-- evento grande). Mesmo acesso de `producer_order_values`: dono do evento ou admin.
--
-- Só cria uma função de leitura. Voltar atrás:
--   DROP FUNCTION IF EXISTS public.lot_sales_counts(uuid[]);

CREATE OR REPLACE FUNCTION public.lot_sales_counts(p_event_ids uuid[])
RETURNS TABLE(event_id uuid, lot_id uuid, vendidos integer, cortesias integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.event_id,
         t.lot_id,
         (count(*) FILTER (WHERE coalesce(o.sale_origin, 'online') <> 'courtesy'))::int,
         (count(*) FILTER (WHERE o.sale_origin = 'courtesy'))::int
    FROM public.tickets t
    JOIN public.orders o ON o.id = t.order_id
   WHERE t.event_id = ANY (p_event_ids)
     AND t.status IN ('valid', 'used')
     AND o.status IN ('paid', 'completed')
     AND (
       EXISTS (SELECT 1 FROM public.events e WHERE e.id = t.event_id AND e.producer_id = auth.uid())
       OR public.has_role(auth.uid(), 'admin'::app_role)
     )
   GROUP BY t.event_id, t.lot_id;
$function$;

COMMENT ON FUNCTION public.lot_sales_counts(uuid[]) IS
  'Vendidos (pago, sem cortesia) e cortesias por lote, contados nos ingressos válidos/usados. '
  'É o número de "vendidos" do painel do produtor; o estoque continua em event_lots.sold_quantity.';

REVOKE ALL ON FUNCTION public.lot_sales_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lot_sales_counts(uuid[]) TO authenticated, service_role;
