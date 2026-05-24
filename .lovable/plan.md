## Problema (confirmado no banco)

No painel do colaborador, tanto os **contadores no topo** (Entraram / Aguardando / Total) quanto os **nomes dentro das listas** aparecem zerados no desktop. No banco do evento `61d0b7dc...` existem:

- Lista Convidados Miguel Lourenço — 26 entradas
- Lista Mulher Free Até ás 18h — 77 entradas
- Lista do Made — 0 entradas
- E ingressos (`tickets`) também devem entrar na conta de Entraram/Aguardando/Total.

A causa é a mesma RLS: as policies de SELECT em `guest_list_entries`, `guest_lists` e `tickets` exigem `auth.uid() = events.producer_id`. Como o colaborador entra via sessão customizada (não é um auth user), todo SELECT direto do client roda anônimo e devolve 0. O celular só "funcionou" antes porque estava logado como produtor — colaborador puro sempre veria zero.

## Solução

Criar **duas Edge Functions** que validam o `session_token` do colaborador (mesmo padrão de `collaborator-validate-guest-entry`) e usam service role para bypassar RLS:

1. **`collaborator-event-stats`** — retorna os contadores agregados (Entraram, Aguardando, Total) somando ingressos + entradas de listas.
2. **`collaborator-list-guests`** — retorna listas ativas do evento + entradas de cada lista.

## Plano

### 1. Nova Edge Function `collaborator-event-stats`
- Input: `event_id`, `collaborator_id`, `session_token`.
- Valida sessão e vínculo com o evento (lança `session_expired` quando for o caso).
- Com service role:
  - `tickets`: conta `used` (entraram) e `valid` (aguardando) para o `event_id`.
  - `guest_list_entries`: conta `checked_in` (entraram) e `pending` (aguardando) das listas ativas do evento.
- Retorna `{ checkins, pending, total }` somando os dois mundos. Mantém a fórmula atual de `total`.

### 2. Nova Edge Function `collaborator-list-guests`
- Input: `event_id`, `collaborator_id`, `session_token`.
- Valida sessão e vínculo com o evento.
- Com service role busca `guest_lists` ativas + `guest_list_entries` (id, name, status, checked_in_at, created_at, added_by), ordenadas por nome (limite alto, ex. 10000).
- Retorna `{ lists: [{ id, name, entries: [...] }] }`.

### 3. `src/pages/colaborador/ColaboradorEvento.tsx`
- Substituir o `fetchStats` para chamar `collaborator-event-stats` via `fetch` com `session_token`.
- Tratar `session_expired` chamando `handleSessionExpired()`.

### 4. `src/components/colaborador/ColaboradorListasTab.tsx`
- Trocar o uso atual de `supabase.from('guest_lists')` / `fetchEntriesForList` por uma chamada única à `collaborator-list-guests`.
- `openList` e `refreshSelectedList` rechamam a function (ou apenas atualizam local a partir do payload retornado).
- Tratar `session_expired`.

### 5. `src/components/colaborador/ColaboradorListaDetalhe.tsx`
- Sem mudanças (já sincroniza prop → estado e tem botão Atualizar).

### 6. Validação
- Logar como colaborador no desktop no evento `61d0b7dc...`.
- Conferir que aparecem 3 listas, abrindo as 26 e 77 entradas corretamente.
- Conferir Entraram / Aguardando / Total batendo com a soma de ingressos + listas.
- Fazer 1 check-in via QR e via lista e confirmar que os contadores sobem ao tocar Atualizar.

## Arquivos

- `supabase/functions/collaborator-event-stats/index.ts` (novo)
- `supabase/functions/collaborator-list-guests/index.ts` (novo)
- `src/pages/colaborador/ColaboradorEvento.tsx` (refator de `fetchStats`)
- `src/components/colaborador/ColaboradorListasTab.tsx` (refator de fetch)

Sem mudanças em RLS, schema ou config.toml.
