## 1) Bug "Erro ao fechar a mesa" — causa real

A edge function `close-table-manual` está retornando **HTTP 500** com `"column event_seats.status does not exist"`. A coluna existe — o problema é o filtro `.or()` montado pelo cliente PostgREST:

```ts
.or(`status.eq.available,and(status.eq.held,hold_expires_at.lt.${nowIso})`)
```

`nowIso` tem `:` e `.` (ex.: `2026-06-13T14:23:01.443Z`), que são caracteres reservados na sintaxe de filtro do PostgREST. O parser confunde a expressão e devolve um erro genérico de "coluna não existe". Por isso falha em qualquer mesa, inclusive nas disponíveis. O toast da UI mostra "Erro ao fechar a mesa." porque o `e.message` é `"Edge Function returned a non-2xx status code"`, e o frontend nunca leu o `error` real do corpo da resposta.

### Correção (edge function `close-table-manual`)
Trocar o `.or()` por **dois UPDATEs em sequência**, ambos atômicos (gate na cláusula `.eq('status', ...)`), sem usar timestamp no filtro `.or`:

1. Primeiro tentar `update().eq('id', seat_id).eq('status','available').select('id').maybeSingle()`.
2. Se voltou vazio, tentar de novo com `.eq('status','held').lt('hold_expires_at', nowIso)` (filtros nativos, sem `.or`).
3. Se ambos voltarem vazio → devolver `seat_unavailable` (409), igual hoje.

A semântica fica idêntica (available **ou** held-expirado vira manual), sem race relevante porque cada UPDATE individual já é atômico no Postgres.

### Correção espelho em `reopen-table-manual`
Vou ler a função e aplicar o mesmo padrão **só se** ela usar o mesmo truque com `.or()` + timestamp. Se ela só faz `.eq('status','manual')`, fica como está.

### Correção no frontend (`EventTablesTab.tsx`)
Independente do fix da função, melhorar a leitura do erro para parar de mascarar erros futuros:
- Em `closeMut.mutationFn` e `reopenMut.mutationFn`, quando `invoke` retornar `error`, ler `error.context.json()` e propagar `new Error(payload.error)` — mesmo padrão que usamos no `Financeiro.tsx`.
- Assim `seat_unavailable` / `forbidden` voltam a cair nos `if`s do `onError` corretamente e o toast certo aparece.

## 2) Mostrar quantas cadeiras a mesa tem vendido

A mesa cobra base + extra por cadeira além da base — então precisa aparecer "X de Y cadeiras compradas".

- Em `useEventTables.ts`: para cada `order_id`/`sold_order_id`, contar `tickets` (`SELECT order_id, count(*) ... WHERE order_id IN (...) AND status IN ('valid','used')`). Adicionar `seats_sold: number | null` em `EventTableRow`.
- No card da grade: linha "Cap." vira "Cap. X de Y" quando vendida (X = seats_sold, Y = max ou base).
- No modal de detalhe (seção Cliente): linha extra "Cadeiras compradas: X de Y".
- Reservas manuais não têm tickets — mantém só capacidade base/máx.

## 3) Botão "Ver mapa" + modal

- Botão "Ver mapa" no header da aba Mesas, ao lado do filtro/busca.
- Modal grande (`Dialog` com `max-w-6xl`, fullscreen no mobile) reusando o `SeatMapRenderer` que o checkout público já usa.
- Carrega o snapshot de `table_maps` + `map_objects` do evento (mesmo padrão de `EventDetailsSeated`).
- Pinta cada mesa pelo status (vendida = verde, manual = âmbar, disponível = neutro).
- Tooltip / popover ao clicar em uma mesa mostrando: código, status, cliente, "X de Y cadeiras" (vem do item #2).
- Só leitura — sem editar layout, sem checkout, sem drag.

Vou extrair o modal pra `src/components/producer/tabs/EventTablesMapModal.tsx` pra não inflar o arquivo principal.

## Arquivos tocados
- `supabase/functions/close-table-manual/index.ts` — substituir `.or()` por dois UPDATEs.
- (eventual) `supabase/functions/reopen-table-manual/index.ts` — se tiver o mesmo padrão.
- `src/hooks/useEventTables.ts` — adicionar `seats_sold`.
- `src/components/producer/tabs/EventTablesTab.tsx` — leitura correta do erro, exibição da contagem, botão "Ver mapa".
- `src/components/producer/tabs/EventTablesMapModal.tsx` — novo, modal do mapa.

## Fora de escopo
- Não mexo em RLS, schema ou outras tabelas.
- Não toco em outras abas/funcionalidades.
- Não mexo na função SQL `request_payout` nem na fase 3 do saque.