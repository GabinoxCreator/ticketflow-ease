-- Até N parcelas sem juros; daí em diante, o cliente paga o custo do cartão.
--
-- Hoje o lote só sabe dizer uma coisa: `modo_taxa = 'absorve'` (o produtor come
-- o custo em TODAS as parcelas) ou `'cliente_paga'` (o comprador paga em todas).
-- A regra do rodeio é a do meio, e é a que o mercado usa: o passe promocional
-- sai a **R$ 300 redondos em até 3x** — e de 4x a 10x continua parcelando, com
-- os juros do cartão por conta de quem parcela (Gabriel, 23/08).
--
-- Sem isto, o teto de 3x cortava o parcelamento: quem quisesse pagar em 6x
-- simplesmente não podia, e a venda ia embora por causa de uma trava que existia
-- só para proteger o repasse do produtor nas três primeiras.
--
-- `parcelas_sem_juros` é o número de parcelas que o PRODUTOR absorve. Acima
-- disso, o custo vai para o comprador, até o teto (`max_parcelas` ou o teto
-- global da adquirente).
--
-- ⚠️ Nulo = comportamento de hoje, sem exceção nenhuma. Lote de todos os outros
-- eventos continua decidindo tudo por `modo_taxa`, bit a bit igual.

ALTER TABLE public.event_lots
  ADD COLUMN IF NOT EXISTS parcelas_sem_juros smallint;

COMMENT ON COLUMN public.event_lots.parcelas_sem_juros IS
  'Quantas parcelas o produtor absorve (cliente paga o valor de face redondo). '
  'Acima disso, o juro do cartão vai para o comprador, até max_parcelas. '
  'Nulo = sem faixa mista; vale o modo_taxa para todas as parcelas.';
