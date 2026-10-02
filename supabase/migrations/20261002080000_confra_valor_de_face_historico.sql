-- 5ª Confra do Bem (29/07/2026): grava o valor de face dos 13 pedidos de cartão
-- que ainda carregam o juro de parcelamento do comprador. OS-108, 02/10/2026.
--
-- POR QUE: o valor do produtor sai de `order_producer_value`, que usa a face
-- gravada em `order_line_face` (capturada no ato desde 17/08) e, sem ela, cai em
-- `total_amount - service_fee_amount`. Na rota de cartão do Marcel o juro da
-- parcela fica DENTRO de `total_amount` (ver _docs/investigacao-juro-parcelamento-repasse.md),
-- então estes 13 pedidos de julho somam R$ 401,16 de juro ao painel do produtor:
-- R$ 89.941,16 em vez de R$ 89.540,00 (242 ingressos pagos x R$ 370).
-- O número certo vinha sendo mostrado por string cravada no formatador da tela
-- (remendo de 30/07); este arquivo leva a correção para a origem e o front tira
-- o remendo.
--
-- POR QUE SÓ ESTES 13: são os únicos pedidos do banco em que a diferença entre
-- `total - taxa` e o preço do lote é juro (rota Marcel, cartão, antes de 17/08).
-- Nos outros eventos antigos a diferença vem de preço de lote alterado depois da
-- venda, e reconstruir a face pelo preço ATUAL do lote seria errado.
-- A face de R$ 370 está provada: os 131 pedidos PIX do mesmo lote, de 25/06 a
-- 29/07, valem exatamente R$ 370 por ingresso, e a taxa de cada um destes 13
-- (R$ 18,50) é 5% de R$ 370.
--
-- `modo_taxa = 'cliente_paga'`: quem pagou o juro foi o comprador (é o modo do
-- lote e é o que a diferença prova). Linha cliente_paga não desconta custo de
-- crédito do repasse.
--
-- Só ACRESCENTA linhas; nada é apagado nem alterado. Idempotente (NOT EXISTS).
-- Se, depois de gravar, o valor do produtor do evento não fechar em R$ 89.540,00,
-- a migration aborta e nada fica gravado.
--
-- Voltar atrás:
--   DELETE FROM public.order_line_face
--    WHERE order_id IN (<os 13 ids abaixo>) AND lot_name = 'Convite Solidário';

INSERT INTO public.order_line_face (order_id, lot_id, lot_name, unit_face, quantity, modo_taxa)
SELECT o.id,
       l.id,
       l.name,
       370.00,
       (SELECT count(*) FROM public.tickets t
         WHERE t.order_id = o.id AND t.lot_id = l.id AND t.status IN ('valid', 'used'))::int,
       'cliente_paga'
  FROM public.orders o
  JOIN public.event_lots l ON l.id = '2ff12896-bde0-44e6-8ada-5ecbae5b1d76'
 WHERE o.id IN (
         'd0d045f1-acee-4eb0-8ab9-ff56b7468cc6',
         '8affd854-b4f0-42d9-90af-43f3893466fe',
         'b8fadaa3-179d-441e-bf15-8c6a5433e312',
         '5c91ca87-39a4-4209-8f99-9b69195f6711',
         '2b67787d-20db-43f9-9b29-0dc1e8536a19',
         '1a04654d-55b8-4d81-9ce0-b33b1d5371bd',
         '92fd94e2-aa27-42f6-9606-4e67b1dd7cc3',
         '4fa99736-81fc-4115-950d-66a04d53a83b',
         '3cdb0d7c-1aba-442a-96ca-cb3cc79f009e',
         'cbe32a33-dac9-4d4f-ad25-69d07eabb2d0',
         '07c85d5a-9f0f-4fd0-b8a7-976ffdf2b350',
         'd6b0992c-5414-4bff-9bed-dec16a818c47',
         'f39269f7-b793-445f-b507-d536438d6a31'
       )
   AND o.event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
   AND o.status = 'paid'
   AND EXISTS (SELECT 1 FROM public.tickets t
                WHERE t.order_id = o.id AND t.lot_id = l.id AND t.status IN ('valid', 'used'))
   AND NOT EXISTS (SELECT 1 FROM public.order_line_face f WHERE f.order_id = o.id);

DO $$
DECLARE
  _total numeric;
BEGIN
  SELECT sum(public.order_producer_value(o))
    INTO _total
    FROM public.orders o
   WHERE o.event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
     AND o.status = 'paid'
     AND coalesce(o.sale_origin, 'online') <> 'courtesy';

  IF _total IS DISTINCT FROM 89540.00 THEN
    RAISE EXCEPTION 'Confra do Bem: valor do produtor deu % (esperado 89540.00). Nada foi gravado.', _total;
  END IF;
END $$;
