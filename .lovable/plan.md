## Problema

A taxa de 10% aparece no resumo do pedido (R$ 22,00), mas o modal de pagamento PIX e a tela de Cartão de Crédito mostram apenas R$ 20,00 — sem a taxa. As edge functions já cobram corretamente, mas o valor exibido na UI está errado.

## Causa

Em `src/components/checkout/CheckoutModal.tsx` (linha 76):

```ts
const finalAmount = Math.max(0, totalAmount - (appliedCoupon?.discountAmount || 0));
```

Esse `finalAmount` é passado para `CheckoutStepPix` e `CheckoutStepCard` e exibido no QR PIX e no botão do cartão. Ele não inclui a taxa de serviço de 10%.

## Correção

Em `src/components/checkout/CheckoutModal.tsx`:

1. Adicionar constante `SERVICE_FEE_RATE = 0.10` no topo.
2. Recalcular `finalAmount` para incluir a taxa sobre `totalAmount` original (taxa não sofre cupom):

```ts
const SERVICE_FEE_RATE = 0.10;
const serviceFee = Math.round(totalAmount * SERVICE_FEE_RATE * 100) / 100;
const finalAmount = Math.max(0, totalAmount - (appliedCoupon?.discountAmount || 0) + serviceFee);
```

Isso faz com que:
- Modal PIX exiba "VALOR A PAGAR R$ 22,00" (alinhado com a edge function que já cobra R$ 22,00).
- Botão de Cartão de Crédito mostre o valor correto com taxa.
- `CheckoutStepPayment` continua mostrando "Taxa de serviço (10%)" no resumo (já está correto).

Nenhuma mudança nas edge functions é necessária — elas já calculam corretamente.

## Arquivo alterado

- `src/components/checkout/CheckoutModal.tsx` (1 edição, ~2 linhas)
