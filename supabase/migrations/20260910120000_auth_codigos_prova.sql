-- Prova do canal antes da senha (redesenho do cadastro, 10/09/2026)
--
-- No cadastro novo a ordem virou: CPF+nome -> escolhe WhatsApp ou e-mail ->
-- digita o contato -> CONFIRMA COM O CÓDIGO -> senha -> facial (opcional).
-- Ordem do Gabriel: a pessoa prova o canal na hora, e não descobre lá no fim
-- que errou o código depois de já ter escolhido senha.
--
-- Até aqui `confirmar_cadastro` conferia código e senha na mesma chamada e
-- queimava o desafio (`usado_em`). Agora são dois momentos:
--   1. `provar_cadastro`  -> marca `provado_em`, NÃO queima, e estica o prazo;
--   2. `confirmar_cadastro` -> resgata a prova e aí sim queima.
--
-- `provado_em` nulo = o desafio nunca foi provado (é o caso de todo login,
-- reset e confirmação de canal, que seguem conferindo e queimando de uma vez).
-- Aditiva: nada do que existe muda de comportamento.

ALTER TABLE public.auth_codigos
  ADD COLUMN IF NOT EXISTS provado_em timestamptz,
  ADD COLUMN IF NOT EXISTS nome text;

COMMENT ON COLUMN public.auth_codigos.provado_em IS
  'Quando a pessoa acertou o código, no cadastro em duas partes. Marcado por '
  '`provarCodigo`, que estica `expira_em` para dar tempo de escolher a senha; '
  '`consumirProva` resgata e queima em `usado_em`. Nulo nos demais propósitos.';

-- O índice de desafio aberto olha `usado_em`, não `provado_em`: um desafio
-- provado e ainda não resgatado continua sendo o desafio aberto daquele
-- destino, e um pedido novo continua invalidando ele. É o que se quer.

-- ---------------------------------------------------------------------------
-- `nome`: o nome do titular, buscado pelo CPF no registro.
--
-- Decisão do Gabriel (10/09/2026): *"o nome nem precisa aparecer, deixa livre,
-- a gente só segue o que está vindo do CPF."* O cadastro não tem mais campo de
-- nome — o servidor busca e grava. Como a busca acontece no PEDIDO do código e
-- a conta só nasce na CONFIRMAÇÃO, o nome precisa de um lugar para esperar
-- entre os dois momentos: é esta coluna.
--
-- Não é dado novo nesta tabela: `cpf` já morava aqui. E fecha de vez a troca de
-- nome entre pedir e confirmar, porque o nome deixou de vir do navegador.
--
-- Só é preenchida no propósito 'cadastro'.
ALTER TABLE public.auth_codigos
  ALTER COLUMN nome SET DEFAULT NULL;

COMMENT ON COLUMN public.auth_codigos.nome IS
  'Nome do titular vindo do registro pelo CPF, esperando entre o pedido do '
  'código e a criação da conta. Só no propósito cadastro. NUNCA vai para a '
  'resposta de uma edge pública — devolver isso reabre o vazamento do item 88.';
