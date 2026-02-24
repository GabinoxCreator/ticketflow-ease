

# Checkout de Cartão de Crédito Personalizado (In-App)

## Problema Atual

Quando o usuário seleciona "Cartão de Crédito", o sistema redireciona para a página externa do Mercado Pago (como mostra o screenshot). Isso quebra a experiência do checkout que é toda personalizada e fluida para PIX.

## Solucao

Usar o **Checkout Transparente** do Mercado Pago, que permite coletar os dados do cartao diretamente no app, tokenizar com o SDK `MercadoPago.js` e processar o pagamento no backend via API `/v1/payments`.

## Pre-requisito: Nova Secret

Sera necessario configurar a **chave publica** do Mercado Pago (`VITE_MERCADOPAGO_PUBLIC_KEY`) como variavel de ambiente. Essa chave e usada no frontend para inicializar o SDK e tokenizar os dados do cartao.

## Alteracoes

### 1. Adicionar SDK do MercadoPago.js

**Arquivo: `index.html`**
- Adicionar `<script src="https://sdk.mercadopago.com/js/v2"></script>` no `<head>`

### 2. Novo componente: `CheckoutStepCard.tsx`

**Arquivo: `src/components/checkout/CheckoutStepCard.tsx`**

Formulario de cartao personalizado seguindo o mesmo padrao visual do checkout (motion animations, rounded-xl, bg-secondary/50, gradient-text, etc.):

- Campo: Numero do cartao (com mascara e deteccao da bandeira)
- Campo: Nome do titular
- Campos lado a lado: Validade (MM/AA) e CVV
- Selector: Parcelas (consulta a API do Mercado Pago para exibir opcoes de parcelamento com juros)
- Campo: CPF do titular
- Resumo do pedido (mesmo estilo do PIX)
- Botao "Pagar" com loading state

O componente usara o SDK `MercadoPago.js` (`window.MercadoPago`) para:
1. `getInstallments()` - buscar opcoes de parcelamento
2. `getPaymentMethods()` - identificar bandeira do cartao
3. `createCardToken()` - tokenizar os dados (nunca saem do navegador sem criptografia)

### 3. Nova Edge Function: `process-card-payment`

**Arquivo: `supabase/functions/process-card-payment/index.ts`**

Recebe o `cardToken`, `installments`, `paymentMethodId`, `issuerId` e dados do pedido. Faz:
1. Valida lotes e disponibilidade (mesmo padrao das outras functions)
2. Cria order com `payment_method: 'card'`
3. Cria tickets com status `valid`
4. Chama `POST https://api.mercadopago.com/v1/payments` com:
   - `token` (card token)
   - `transaction_amount`
   - `installments`
   - `payment_method_id`
   - `payer.email`
5. Se pagamento aprovado (`status: 'approved'`): atualiza order para `completed`
6. Se rejeitado: faz rollback (deleta tickets e order), retorna erro amigavel
7. Retorna resultado para o frontend

### 4. Atualizar `CheckoutModal.tsx`

- Importar `CheckoutStepCard`
- Novo step `'card'` no tipo `CheckoutStep`
- Quando usuario seleciona cartao no `CheckoutStepPayment`, ir para step `'card'` (em vez de redirecionar)
- No `CheckoutStepCard`, ao sucesso, ir direto para step `'success'`
- Adicionar titulo "Dados do Cartao" no header para o step `card`
- Atualizar step indicator para incluir o step `card`

### 5. Atualizar `Checkout.tsx` (pagina standalone)

- Mesma logica: ao selecionar cartao, mostrar formulario inline em vez de redirecionar
- Importar e renderizar `CheckoutStepCard` quando `paymentMethod === 'card'`

## Secao Tecnica

### Fluxo do pagamento com cartao:

```text
Usuario preenche dados do cartao
        |
        v
MercadoPago.js tokeniza (createCardToken)
        |
        v
Frontend envia token + dados ao Edge Function
        |
        v
Edge Function cria order + tickets no DB
        |
        v
Edge Function chama POST /v1/payments (Mercado Pago API)
        |
        v
Resposta: approved / rejected / in_process
        |
        v
Frontend mostra sucesso ou erro
```

### Mensagens de erro amigaveis para rejeicoes comuns:
- `cc_rejected_insufficient_amount` -> "Saldo insuficiente"
- `cc_rejected_bad_filled_security_code` -> "Codigo de seguranca incorreto"
- `cc_rejected_bad_filled_date` -> "Data de validade incorreta"
- `cc_rejected_bad_filled_other` -> "Dados do cartao incorretos"
- Outros -> "Pagamento nao aprovado. Tente outro cartao."
