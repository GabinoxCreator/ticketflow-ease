-- ============================================================================
-- COMBO PASSA A TER IMAGEM PRÓPRIA
-- 01/10/2026 · OS-101
-- ============================================================================
--
-- POR QUE
--   O card do combo mostrava a foto de um dos produtos — no "Convite +
--   camiseta" aparecia só a camiseta, e o convite ficava invisível. Pedido do
--   Gabriel: "tenta criar algo pra exemplificar que é o convite, a camiseta e
--   o copo". Para isso o combo precisa de imagem própria, montada com as duas
--   ou três coisas que vêm nele.
--
-- O QUE FAZ
--   Uma coluna. Quem não tiver imagem continua caindo na foto do produto, como
--   hoje — nada quebra em evento nenhum.
--
-- COMO VOLTAR ATRÁS
--   ALTER TABLE public.event_bundles DROP COLUMN image_url;
-- ============================================================================

ALTER TABLE public.event_bundles
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.event_bundles.image_url IS
  'Imagem própria do combo, mostrando o que vem nele. Vazio = o card usa a foto de um dos produtos (OS-101, 01/10/2026).';
