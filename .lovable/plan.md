## Mudança

Na aba **Ao Vivo** do colaborador, a "Receita Total" e os valores de cada venda recente vão refletir apenas a **receita de ingressos** — o mesmo valor que vai para o repasse do produtor (sem a taxa de serviço cobrada do cliente).

## Fórmula

Para cada pedido online/manual:
```
receita_ingressos = total_amount - service_fee_amount
```
Vendas na portaria (`door_sales`) não têm taxa de serviço, então entram com `total_amount` cheio.

## Arquivo

`supabase/functions/collaborator-live-stats/index.ts`

- Incluir `service_fee_amount` no SELECT de `orders`.
- `onlineRevenue` passa a somar `(total_amount - service_fee_amount)`.
- No feed `recent`, cada item de pedido usa `amount = total_amount - service_fee_amount`.
- `avgTicket` é recalculado com a receita líquida.
- Door sales seguem inalteradas.

Deploy da função após a edição.
