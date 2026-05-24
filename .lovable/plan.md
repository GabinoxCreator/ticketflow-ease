## Objetivo
Na aba **Check-in** do colaborador, listar todos os ingressos vendidos do evento com filtro de busca por nome, mantendo os ainda não validados no topo e empurrando os já validados para o fim da lista.

## Mudanças

### 1. Nova Edge Function `collaborator-list-tickets`
Mesmo padrão de `collaborator-list-guests` / `collaborator-search-tickets`:
- Input: `event_id`, `collaborator_id`, `session_token`
- Valida sessão (bcrypt) + acesso do colaborador ao evento
- Busca em `tickets` (com join `event_lots(name)`) filtrando por `event_id` e `status in ('valid','used')` — pendentes/cancelados ficam de fora
- Retorna ordenado por `status asc` (valid antes de used) e `holder_name asc`, com limite alto (10000)
- Devolve `{ tickets: [{ id, ticket_code, holder_name, holder_email, status, validated_at, lot_name }] }`

### 2. `src/components/colaborador/ColaboradorQRTab.tsx`
- Ao montar (e após cada `onCheckinDone`), faz fetch em `collaborator-list-tickets` e guarda em `allTickets`
- Substituir o formulário "Buscar ingresso" por **filtro client-side em tempo real** (input controlado, sem botão de submit), por nome/email/código
- Renderizar a lista completa de `allTickets` filtrada, ordenada:
  1. `status === 'valid'` primeiro (ordem alfabética por nome)
  2. `status === 'used'` depois (mais recentes validados primeiro via `validated_at desc`)
- Manter o card de check-in manual (botão "Check-in" para itens `valid`); após validar, atualiza o item local para `used` (cai para baixo automaticamente)
- Mostrar contador "X aguardando · Y validados" no topo da lista
- Manter o fluxo de código direto (digitar um ticket_code completo) chamando `collaborator-validate-ticket` action `check`, mas como atalho secundário — o caso principal vira o filtro local
- Loading state na primeira carga; mensagem vazia se evento não tem ingressos

### 3. Sem alterações em RLS/DB
A nova função usa service-role como as demais; nenhuma migração necessária.

## Detalhes técnicos
- A função `collaborator-list-tickets` segue o mesmo `validateSession` (bcrypt `compareSync`) e CORS já usados nas funções de colaborador.
- O filtro client-side normaliza com `toLowerCase()` e remove acentos via `normalize('NFD').replace(/[\u0300-\u036f]/g,'')`.
- O fetch da lista usa `useEffect` com dependência `[eventId]` e é re-disparado por `onCheckinDone` via um `refreshKey` interno.

## Fora de escopo
- Não mexe na aba **Listas** (já tem seu próprio fluxo).
- Não muda RLS, schema, nem fluxo de pagamento.