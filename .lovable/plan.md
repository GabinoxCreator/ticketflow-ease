## Correção da taxa exibida no checkout PIX

**Problema:** O backend já cria a ordem PIX com R$0 de taxa (override admin funciona), mas a tela mostra R$275 porque o `CheckoutModal` calcula o total usando sempre a taxa do cartão (10%), independente do método selecionado.

### Mudanças

**`src/components/checkout/CheckoutModal.tsx`**
- Adicionar estado `selectedMethod: 'pix' | 'card' | null`, atualizado em `handlePaymentSelect`.
- Calcular `serviceFee` e `finalAmount` usando:
  - `fees.pixPercent` / `fees.pixFixed` quando `selectedMethod === 'pix'`
  - `fees.cardPercent` / `fees.cardFixed` caso contrário
- Passar o `finalAmount` correto para `CheckoutStepPix` e `CheckoutStepCard`.

**`supabase/functions/create-mercadopago-pix/index.ts`**
- Retornar `amount` (total cobrado) e `service_fee_amount` no JSON da resposta, para o frontend ter a fonte da verdade.

**`src/components/checkout/CheckoutStepPix.tsx`**
- Priorizar o `amount` retornado pela edge function (quando disponível) sobre o `totalAmount` recebido via props, garantindo que a tela sempre reflita o valor real cobrado.

### Fora de escopo
- Schema do banco, RLS, card de override admin, edge function de cartão — já estão corretos.
