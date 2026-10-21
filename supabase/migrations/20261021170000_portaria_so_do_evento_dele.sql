-- OS-268 (21/10/2026) · Portaria só do evento do produtor, e login que não derruba.
-- Nasceu da varredura OS-262 (_docs/varredura-banco/site-2026-10-17.md, achados E1 e E2).
--
-- O que esta migration faz (só a tabela collaborators; o resto é das edges):
--
-- 1) Nome de login da portaria passa a ser ÚNICO NO SITE INTEIRO, sem diferença entre
--    maiúscula e minúscula (E2). Antes era único só dentro de cada produtor
--    (collaborators_producer_id_username_key), e o login procura só pelo nome: dois
--    ativos com o mesmo nome derrubavam o login dos dois no dia do evento, e qualquer
--    produtor podia criar um colaborador com o nome da portaria de um cliente.
--    A edge create-collaborator responde "Já existe um colaborador com este username"
--    (o erro 23505 que ela já tratava).
--
-- 2) O nome fica sempre em minúsculas e sem espaço nas pontas. As edges
--    create-collaborator e update-collaborator já gravam assim e o collaborator-login
--    procura assim; a regra garante o mesmo para quem mexer direto pela tabela (a regra
--    de acesso "Produtores podem atualizar seus colaboradores" deixa o produtor mudar o
--    nome sem passar pela edge). Em 21/10, 0 de 51 nomes fogem disso.
--
-- 3) O único repetido de hoje é "gab1234", ativo em duas contas do próprio Gabriel
--    (nenhum cliente). Fica com o nome o da conta 25733b22 (eventos de junho); o da conta
--    de testes d3d026f9 (eventos de março e abril, já passados) vira "gab1234.teste".
--    Hoje nenhum dos dois entra: o login dá erro com nome repetido.
--    Se outro repetido aparecer até a subida, a criação do índice FALHA e a migration
--    inteira volta atrás: de propósito, para ninguém renomear login de cliente às cegas.
--
-- O que NÃO muda aqui:
--  - A regra de acesso de collaborator_events (INSERT) já confere, no ar, que o
--    colaborador E o evento são do usuário logado. O buraco era a edge
--    create-collaborator, que grava com a chave de serviço e passava por cima dela:
--    o conserto está na edge.
--  - O índice antigo (producer_id, username) fica: é mais fraco que o novo e não atrapalha.

-- 3) o repetido de hoje ----------------------------------------------------------------
update public.collaborators
   set username = 'gab1234.teste', updated_at = now()
 where id = 'c4bda5a0-9b85-442d-9636-9a71c84b1b1c'
   and username = 'gab1234';

-- 2) nome sempre em minúsculas, sem espaço nas pontas, nunca vazio ------------------------
alter table public.collaborators
  add constraint collaborators_username_normalizado
  check (username = lower(btrim(username)) and length(username) > 0);

-- 1) nome único no site inteiro ----------------------------------------------------------
create unique index collaborators_username_unico
  on public.collaborators (lower(username));

-- Como voltar atrás (não desfaz a troca de nome do gab1234.teste, que é inofensiva):
-- drop index if exists public.collaborators_username_unico;
-- alter table public.collaborators drop constraint if exists collaborators_username_normalizado;
