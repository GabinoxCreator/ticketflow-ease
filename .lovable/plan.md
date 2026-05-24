## Adição em massa de convidados nas listas

**Problema:** Hoje, no gerenciador de convidados de uma lista, só existe um campo para adicionar um nome por vez. As listas chegam via WhatsApp com vários nomes, um por linha, e adicionar manualmente é trabalhoso.

### Mudanças

**`src/components/producer/GuestListEntriesManager.tsx`**
- Remover o formulário inline de "Adicionar Convidado" (input + botão único).
- Substituir por um único botão **"Adicionar Convidados"** que abre um modal.
- Manter intactas: estatísticas (Total / Pendentes / Check-in), busca, e a lista de entradas com check-in/excluir.

**Novo: `src/components/producer/BulkAddGuestsDialog.tsx`**
- Modal com um `Textarea` grande ("Cole os nomes, um por linha").
- Pré-visualização ao vivo mostrando quantos nomes válidos foram detectados (ex.: "32 convidados serão adicionados").
- Regras de parsing:
  - Quebrar por linha (`\n`).
  - `trim()` em cada linha.
  - Ignorar linhas vazias.
  - Remover duplicatas exatas dentro do próprio texto colado (case-insensitive), mantendo a primeira ocorrência.
  - Limite de tamanho por nome (ex.: 120 caracteres) — linhas maiores são truncadas e sinalizadas.
- Botões: **Cancelar** e **Adicionar N convidados** (desabilitado se N = 0).
- Ao confirmar:
  - Inserir todos os convidados em uma única chamada `supabase.from('guest_list_entries').insert([...])` (bulk insert), com `guest_list_id`, `name`, `added_by: 'producer'`.
  - Mostrar `toast.success("N convidados adicionados")` (ou erro detalhado).
  - Invalidar as queries `guest-list-entries` e `guest-lists` para atualizar contadores.
  - Fechar o modal e limpar o textarea.

**`src/hooks/useGuestLists.ts`**
- Adicionar mutation `addEntriesBulk({ listId, names: string[] })` que faz o insert em lote e invalida as queries certas. A mutation existente `addEntry` pode ser mantida (não é usada em outro lugar relevante além desse manager, mas mantemos por segurança — pode ser removida no futuro).

### Fora de escopo
- Não toca em RLS, schema do banco, edge functions ou na tela pública de cadastro (`/lista/:slug`).
- Não muda nada da lista de listas (`EventListsTab`), apenas do gerenciador interno de uma lista.
- Sem limite máximo por lista além do `max_guests` já existente (se a lista tiver `max_guests` definido e o bulk ultrapassar, o backend ainda aceita — não vamos adicionar bloqueio agora; se quiser eu adiciono depois).
