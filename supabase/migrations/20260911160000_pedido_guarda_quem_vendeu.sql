-- O pedido passa a guardar QUAL COLABORADOR vendeu.
--
-- Pedido do Gabriel (11/09/2026): a Porcada do Amor vai com 5 equipamentos (4
-- maquininhas e 1 totem), cada um com seu login, "pra depois vincular o nome do
-- colaborador ou estabelecimento que está vendendo e saber como foi".
--
-- ⚠️ O QUE ESTAVA FALTANDO, e que fazia os 5 logins não servirem para nada: o pedido
-- só guardava `sale_origin='smartpos'`. Vendessem 5 aparelhos ou 50, tudo caía igual
-- no banco — o login autorizava a venda e depois se perdia. Não havia como responder
-- "quanto vendeu a POS 03", que é exatamente a pergunta que ele quer fazer.
--
-- Aditiva e nula: pedido antigo continua sem colaborador (não há como recuperar quem
-- vendeu o que já passou), e nenhuma rota é obrigada a preencher. O ON DELETE SET NULL
-- é de propósito: se um colaborador for apagado um dia, o PEDIDO não pode sumir junto
-- nem travar a exclusão — pedido nunca se apaga (lição de 23/05).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS collaborator_id uuid
    REFERENCES public.collaborators(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.collaborator_id IS
  'Colaborador (login do equipamento) que fez a venda no totem/maquininha. Nulo em venda online, cortesia de admin e pedidos anteriores a 11/09/2026.';

-- Relatório por equipamento é a razão da coluna existir: sempre filtra por evento
-- e agrupa por colaborador.
CREATE INDEX IF NOT EXISTS idx_orders_event_collaborator
  ON public.orders (event_id, collaborator_id)
  WHERE collaborator_id IS NOT NULL;
