-- O repasse precisa saber quem pagou o cartão EM CADA VENDA.
--
-- Desde 23/08 um lote pode ser sem juros até N parcelas e com juros acima disso:
-- o passe promocional do rodeio sai a R$ 300 em até 3x (o produtor absorve) e a
-- R$ 351,17 em 10x (o comprador paga). O `modo_taxa` do LOTE deixou de responder
-- sozinho a pergunta "quem pagou o custo?".
--
-- ⚠️ O RISCO CONCRETO, e é por isto que isto entra ANTES da primeira venda:
-- `order_line_face.modo_taxa` vinha do lote. Numa venda em 10x ele gravaria
-- 'absorve', e o motor de repasse — que entra em setembro/outubro — descontaria
-- do produtor um custo de crédito que o COMPRADOR já tinha pagado. O produtor
-- receberia a menos, e o erro só apareceria no fechamento, depois do evento,
-- com a venda impossível de refazer.
--
-- `order_credit_terms.parcelas_sem_juros` guarda a faixa que valia no momento da
-- compra. Não é redundante com o lote: `event_lots` é MUTÁVEL — o produtor muda
-- a condição no meio da venda e o passado mudaria junto. O mesmo motivo pelo
-- qual `unit_face` e `lot_name` já são congelados aqui (§6 do framework).
--
-- Também deixa registrado, para quem for construir o motor de repasse:
-- linha com `modo_taxa = 'cliente_paga'` NÃO desconta custo de crédito do
-- produtor. O comprador já pagou esse custo dentro do valor cobrado.

ALTER TABLE public.order_credit_terms
  ADD COLUMN IF NOT EXISTS parcelas_sem_juros smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.order_credit_terms.parcelas_sem_juros IS
  'Até quantas parcelas o produtor absorveu o custo NESTA compra. Congelado no '
  'ato da venda porque event_lots é mutável. 0 = não havia faixa sem juros.';

COMMENT ON COLUMN public.order_line_face.modo_taxa IS
  'Quem pagou o custo do cartão NESTA venda: absorve (produtor) ou cliente_paga. '
  'Decidido comparando as parcelas escolhidas com a faixa sem juros do lote — '
  'NÃO é uma cópia de event_lots.modo_taxa. Linha cliente_paga não desconta '
  'custo de crédito do repasse: o comprador já pagou esse custo.';
