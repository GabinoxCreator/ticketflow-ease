

# Migrar Gateway de Pagamento: Stripe para Mercado Pago

## Resumo

Substituir toda a integracao com Stripe pela API do Mercado Pago, mantendo o checkout personalizado atual com suporte a PIX e Cartao de Credito. Como o modelo sera pagamento direto (sem split), a parte de Stripe Connect (onboarding de produtores) sera removida.

## Etapa 1: Configurar credenciais do Mercado Pago

- Solicitar ao usuario o **Access Token** do Mercado Pago (chave privada) para ser armazenado como secret na Lovable Cloud
- A **Public Key** do Mercado Pago sera armazenada no codigo como variavel de ambiente `VITE_MERCADOPAGO_PUBLIC_KEY`

## Etapa 2: Criar edge function `create-mercadopago-preference`

Substituir `create-checkout-session` por uma nova funcao que:
- Recebe os dados do pedido (eventId, items, dados do cliente)
- Valida disponibilidade dos lotes
- Cria o pedido na tabela `orders` com status `pending`
- Cria uma **Preference** no Mercado Pago via API REST com:
  - Itens do carrinho
  - URLs de retorno (success, failure, pending)
  - Dados do pagador (email, nome, CPF)
  - Metodos de pagamento: PIX e cartao de credito
- Retorna o `init_point` (URL do checkout do Mercado Pago) ou o ID da preference

## Etapa 3: Criar edge function `create-mercadopago-pix`

Substituir `create-pix-payment` por uma funcao que:
- Cria o pedido na tabela `orders`
- Cria um **pagamento PIX** via API do Mercado Pago (`/v1/payments`)
  - `payment_method_id: "pix"`
  - Inclui dados do pagador com CPF
- Retorna o `qr_code` e `qr_code_base64` para exibir no checkout
- Retorna o `ticket_url` e data de expiracao

## Etapa 4: Criar edge function `check-mercadopago-payment`

Nova funcao para verificar status de pagamento:
- Recebe o `payment_id` ou `order_id`
- Consulta a API do Mercado Pago (`/v1/payments/{id}`)
- Retorna o status atualizado (approved, pending, rejected)
- Se aprovado, atualiza o pedido e tickets no banco

## Etapa 5: Atualizar o frontend do Checkout

### `CheckoutModal.tsx`
- Alterar `handlePaymentSelect` para chamar as novas edge functions
- Para cartao: redirecionar para o `init_point` do Mercado Pago (checkout hospedado) ou usar o Checkout Bricks inline
- Para PIX: chamar `create-mercadopago-pix` e exibir QR Code retornado pela API

### `CheckoutStepPayment.tsx`
- Sem mudancas visuais significativas, apenas manter PIX e Cartao

### `CheckoutStepPix.tsx`
- Atualizar para usar o QR Code retornado pelo Mercado Pago (que ja vem pronto)
- Polling de status usando `check-mercadopago-payment`

### `Checkout.tsx` (pagina separada de checkout)
- Atualizar chamadas de funcoes para as novas edge functions do Mercado Pago

### `CheckoutSuccess.tsx`
- Atualizar para funcionar com parametros de retorno do Mercado Pago (`payment_id`, `status`, `external_reference`)

## Etapa 6: Remover integracao Stripe Connect (produtor)

Como o modelo agora e pagamento direto:
- Remover `StripeEmbeddedOnboarding.tsx`
- Remover `StripeConnectCard.tsx`
- Remover `useStripeConnect.ts`
- Simplificar `Financeiro.tsx` (remover componentes do Stripe Connect)
- Remover edge functions:
  - `create-stripe-connect-account`
  - `check-stripe-connect-status`
  - `create-account-session`
  - `get-stripe-dashboard-link`
- Remover dependencias npm: `@stripe/connect-js`, `@stripe/react-connect-js`

## Etapa 7: Remover edge functions antigas do Stripe

- `create-checkout-session`
- `create-pix-payment`
- Atualizar `supabase/config.toml` com as novas funcoes

## Etapa 8: Limpar variaveis e secrets

- Remover `VITE_STRIPE_PUBLISHABLE_KEY` do `.env`
- O `STRIPE_SECRET_KEY` podera ser removido dos secrets
- Adicionar `MERCADOPAGO_ACCESS_TOKEN` como novo secret
- Adicionar `VITE_MERCADOPAGO_PUBLIC_KEY` ao codigo

## Arquivos afetados

| Arquivo | Acao |
|---------|------|
| `supabase/functions/create-mercadopago-preference/index.ts` | Criar (novo) |
| `supabase/functions/create-mercadopago-pix/index.ts` | Criar (novo) |
| `supabase/functions/check-mercadopago-payment/index.ts` | Criar (novo) |
| `supabase/functions/create-checkout-session/index.ts` | Remover |
| `supabase/functions/create-pix-payment/index.ts` | Remover |
| `supabase/functions/create-stripe-connect-account/index.ts` | Remover |
| `supabase/functions/check-stripe-connect-status/index.ts` | Remover |
| `supabase/functions/create-account-session/index.ts` | Remover |
| `supabase/functions/get-stripe-dashboard-link/index.ts` | Remover |
| `supabase/config.toml` | Atualizar (novas funcoes) |
| `src/components/checkout/CheckoutModal.tsx` | Editar |
| `src/components/checkout/CheckoutStepPix.tsx` | Editar |
| `src/pages/Checkout.tsx` | Editar |
| `src/pages/CheckoutSuccess.tsx` | Editar |
| `src/components/producer/StripeEmbeddedOnboarding.tsx` | Remover |
| `src/components/producer/StripeConnectCard.tsx` | Remover |
| `src/hooks/useStripeConnect.ts` | Remover |
| `src/pages/Financeiro.tsx` | Simplificar |

## Observacoes importantes

- A API do Mercado Pago usa chamadas REST diretas (fetch) nas edge functions, nao precisa de SDK especial
- O PIX do Mercado Pago retorna QR Code pronto (base64 e texto copia-cola)
- O checkout para cartao de credito pode usar o checkout hospedado do Mercado Pago (redirect) ou Checkout Bricks (inline) - inicialmente usaremos o redirect por ser mais simples
- A validacao do pagamento do cartao sera feita na pagina de sucesso consultando o status via API

