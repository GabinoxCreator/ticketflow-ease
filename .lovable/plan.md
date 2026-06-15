Liberar a edição do mapa quando o evento publicado já passou.

### Problema
`MapEditorPage` trava o editor em modo somente-leitura sempre que existe qualquer `event` com `status='published'` vinculado ao `table_map_id`. O evento "Brasil x Marrocos" terminou em 14/06/2026 (hoje é 15/06/2026), mas continua publicado, então o mapa fica bloqueado mesmo já tendo passado.

### Mudança
Em `src/pages/producer/MapEditorPage.tsx` (query `map-published-event`):
1. Selecionar também `date`, `end_date`, `end_time` dos eventos publicados que usam o mapa.
2. Considerar como "bloqueante" apenas eventos cujo fim ainda não passou (horário de São Paulo): usa `end_date + end_time` (ou `end_date` 23:59 se faltar `end_time`, ou `date` 23:59 como fallback).
3. `isReadOnly = true` apenas se existir algum evento publicado e ainda não encerrado vinculado ao mapa. Eventos publicados já encerrados deixam o mapa editável.

Nada muda na lógica de salvar, RLS, ou em outras telas. Só o gate visual + o `throw` da mutation passam a respeitar o fim do evento.