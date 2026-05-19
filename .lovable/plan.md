Adicionar taxa de serviço de 10% cobrada do cliente final no checkout.

**Regra da taxa:** sempre 10% sobre o **subtotal original dos ingressos** (preço × quantidade). Cupons e descontos NÃO afetam a taxa — só descontam o valor do ingresso.

Exemplo: 1 ingresso R$ 20 + cupom −R$ 5
- Subtotal: R$ 20,00
- Desconto: −R$ 5,00
- Taxa de serviço (10% sobre R$ 20): R$ 2,00
- **Total: R$ 17,00**

## Banco
- Migration: adicionar `service_fee_amount NUMERIC NOT NULL DEFAULT 0` em `orders`. Vendas anteriores ficam com 0 (preservadas).

## Frontend — CheckoutStepPayment.tsx
- `subtotal = soma(price × quantity)`
- `serviceFee = round(subtotal * 0.10, 2)` — calculado sempre sobre o subtotal, independente do cupom
- `finalAmount = subtotal − desconto + serviceFee`
- Adicionar linha "Taxa de serviço (10%)  + R$ X,XX" no card de resumo, acima do Total
- Total destacado passa a mostrar o finalAmount com a taxa
- Remover "Sem taxas" do texto do botão PIX

## Edge Functions (create-mercadopago-pix, process-card-payment)
- Calcular `subtotal` antes do desconto
- `serviceFee = round(subtotal * 0.10, 2)` (sempre sobre subtotal)
- `chargedAmount = subtotal − discount + serviceFee` → enviado ao Mercado Pago como `transaction_amount` e salvo em `orders.total_amount`
- Persistir `service_fee_amount` no insert de `orders`

## Hooks de receita (para não inflar receita do produtor com a taxa)
- `useEventStats.ts`: usar `(order.total_amount − order.service_fee_amount)` ao ratear receita por ticket
- `useEventOrders.ts`: `totalRevenue` baseado em `total_amount − service_fee_amount`
- `useProducerFinance.ts`: idem

Pedidos antigos têm `service_fee_amount = 0` → seguem aparecendo exatamente como hoje.

## Constante
`SERVICE_FEE_RATE = 0.10` replicada no componente de checkout e nas edge functions. Arredondamento: `Math.round(x*100)/100`.

## Arquivos
- nova migration SQL
- src/components/checkout/CheckoutStepPayment.tsx
- supabase/functions/create-mercadopago-pix/index.ts
- supabase/functions/process-card-payment/index.ts
- src/hooks/useEventStats.ts
- src/hooks/useEventOrders.ts
- src/hooks/useProducerFinance.ts