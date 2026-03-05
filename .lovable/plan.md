

# Corrigir Contagem de Ingressos Vendidos (Apenas Pagos)

## Problema

O `sold_quantity` nos lotes é incrementado no momento da criação do pedido (como reserva), antes da confirmação do pagamento. Isso faz com que pedidos pendentes apareçam como "vendidos" nos dashboards.

## Solução

Alterar o `useEventStats` para calcular ingressos vendidos com base nos tickets com status `valid` ou `used` (que são os efetivamente pagos), em vez de usar o `sold_quantity` do lote.

**Arquivo: `src/hooks/useEventStats.ts`**

1. Calcular `soldQuantity` a partir dos tickets pagos (status `valid` ou `used`) em vez de `lot.sold_quantity`
2. Recalcular `availableQuantity` como `totalQuantity - paidTicketsCount`
3. Atualizar `salesByLot` para usar contagem de tickets pagos por lote em vez de `lot.sold_quantity`
4. Recalcular receita por lote com base nos tickets pagos

Mudanças específicas no `useMemo`:
- `soldQuantity` = contagem de tickets com status `valid` ou `used`
- `availableQuantity` = `totalQuantity - soldQuantity`
- Em `salesByLot`, filtrar `lotTickets` para apenas status `valid` ou `used`
- Usar `lotTickets.length` para `soldQuantity` do lote

Isso não altera o mecanismo de reserva (o `sold_quantity` no banco continua sendo usado para verificar disponibilidade nas edge functions), mas corrige a exibição no dashboard.

