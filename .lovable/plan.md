## Problema

Na aba **Visão Geral** do evento, o card "Vendas por Lote" mostra a receita do lote como `quantidade vendida × preço atual do lote`. Como o preço do lote foi alterado (de R$ 1 para R$ 20), os 8 ingressos vendidos aparecem como R$ 160, mas a receita real é R$ 46 (preço cobrado na época das compras).

A "Receita Total" no topo já está correta (R$ 46), porque vem de `orders.total_amount`. O bug é só no cálculo por lote.

## Causa

`src/hooks/useEventStats.ts` calcula:

```ts
const lotRevenue = lotTickets.length * Number(lot.price);
```

Isto ignora o preço histórico que o cliente realmente pagou.

## Correção

Calcular a receita de cada lote a partir dos **pedidos pagos**, não do preço atual:

1. Para cada `order` pago, dividir `order.total_amount` pela quantidade de tickets daquela order → valor pago por ticket.
2. Para cada ticket pago (`valid` ou `used`), somar esse valor no lote do ticket (`ticket.lot_id`).
3. Usar essa soma como `revenue` em `salesByLot`.

Isto reflete o valor realmente cobrado, independentemente de alterações futuras no preço do lote, e mantém consistência com a "Receita Total".

### Arquivo alterado

- `src/hooks/useEventStats.ts` — substituir `lotRevenue = lotTickets.length * Number(lot.price)` pelo cálculo agregado a partir de `paidOrders` + `tickets`.

Nenhum outro arquivo precisa ser tocado (a aba "Ingressos"/lotes que mostra preço unitário e progresso continua usando o preço atual, o que está correto para exibir o preço de venda atual).