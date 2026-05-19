## Problema

No card de "Eventos Ativos" (`EventListItem`), a receita exibida é calculada como:

```
revenue = Σ (lot.sold_quantity × lot.price_atual)
```

Para o evento "Lançamento Audiovisual…":
- 19 ingressos vendidos × R$ 20 (preço atual do lote) = **R$ 380** (exibido)
- Receita real dos pedidos pagos: **R$ 266** (11 pedidos `paid`)

A diferença vem de cupons, descontos e/ou mudanças de preço de lote ao longo do tempo. O cálculo atual ignora tudo isso e só multiplica quantidade × preço atual.

## Solução

Trocar a fonte da receita para a **soma real de `total_amount` dos pedidos com status `paid`** do evento, que é o padrão usado em outras telas do produtor (FestPag — "Order Status: Paid orders use 'paid'").

### Arquivos alterados

**1. `src/hooks/useEvents.ts`**
- No `useEvents()`, após buscar os eventos, fazer uma segunda query agregada:
  ```ts
  supabase
    .from('orders')
    .select('event_id, total_amount')
    .eq('status', 'paid')
    .in('event_id', eventIds)
  ```
- Agrupar por `event_id` no client e anexar `paid_revenue: number` em cada evento retornado.
- Atualizar a interface `Event` para incluir `paid_revenue?: number`.

**2. `src/components/producer/EventListItem.tsx`**
- Substituir o cálculo local de `revenue` por `event.paid_revenue ?? 0`.
- Manter `sold`, `capacity` e `occupancy` como estão (vêm de `event_lots` e refletem inventário, não dinheiro).

### Fora de escopo
- Não mexer em `EventDashboardHeader` / `EventOverviewTab` (essas já usam `useEventStats`/queries próprias — verificar rapidamente na implementação, mas só ajustar se reproduzirem o mesmo bug).
- Não tocar em tracking, RLS, ou checkout.

## Validação manual
1. Abrir `/produtor/dashboard` com a conta admin/produtor atual.
2. Card do evento "Lançamento Audiovisual…" deve mostrar **R$ 266** (não R$ 380).
3. `19/100 vendidos` e `19% Ocupação` permanecem iguais.
4. Eventos sem pedidos pagos mostram **R$ 0**.