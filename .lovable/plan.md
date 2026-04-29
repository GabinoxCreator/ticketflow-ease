## Objetivo

Refazer o fluxo de checkout para ser **fullscreen no mobile**, com navegação clara (voltar mantém o carrinho), forma de pagamento que avança automaticamente ao selecionar (sem botão "Finalizar Compra"), telas de PIX e cartão com layout premium, QR Code limpo (sem logo do Lovable), e introduzir **cupons de desconto** gerenciados pelo produtor e aplicáveis no resumo do pedido.

## 1. Modal de checkout fullscreen — `CheckoutModal.tsx`

- No mobile (`useIsMobile`), o `DialogContent` ocupa **100vw × 100vh**, sem bordas arredondadas, sem `max-h-[70vh]` no conteúdo. Conteúdo rola só se ultrapassar a altura da tela.
- No desktop, mantém o modal centralizado atual.
- Header redesenhado:
  - Botão **← Voltar** à esquerda (sempre visível, exceto em `success`/`awaiting`).
  - Título **centralizado** (Pagamento / PIX / Cartão / etc.).
  - Botão **× Fechar** à direita.
- Comportamento do "Voltar":
  - Em `payment` → fecha o modal **mantendo o carrinho** (estado `selectedLots` em `EventDetails` permanece intacto — já é o caso hoje, só garantir que `handleClose` não limpe nada externo).
  - Em `card` ou `pix` → volta para `payment`.
- Remover a barra de "step indicator" (`form`/`payment`/`card`) — o título já comunica a etapa e ela polui o fullscreen.

## 2. Tela "Pagamento" (resumo + forma) — `CheckoutStepPayment.tsx`

- Adicionar bloco **"Cupom de desconto"** dentro do card de Resumo:
  - Input + botão "Aplicar" (compactos).
  - Estado: `applied | invalid | none`. Quando aplicado: mostrar nome do cupom + valor descontado em verde + botão "remover".
  - Linha "Subtotal", "Desconto (-R$ X,XX)" e "Total" recalculado.
- Remover o botão **"Finalizar Compra"**. Ao **clicar em PIX ou Cartão**, dispara imediatamente `onSelectPayment(method)` (auto-avança).
  - PIX → loading inline no próprio card de PIX enquanto cria a cobrança, depois transiciona para a tela PIX.
  - Cartão → transição direta para a tela do cartão.
- Visual: cards de método maiores, com hover/active states mais marcantes.

## 3. Tela PIX — `CheckoutStepPix.tsx`

- Layout reorganizado para caber em uma tela mobile sem rolagem excessiva:
  - **Topo:** Timer compacto + valor em destaque.
  - **Centro:** QR Code grande e centralizado, **sem logo no meio** (remover `imageSettings` do `QRCodeSVG`; opcional usar `logoFestpag` no futuro, mas por ora deixar limpo).
  - **Abaixo do QR:** botão "Copiar código PIX" full-width (mais óbvio que o ícone atual) + caixa colapsável com o código.
  - **Instruções:** versão enxuta em 3 passos, fonte menor.
  - **Botões:** "Já paguei, verificar" (primário) — o polling automático continua.
- Tudo dentro de container fullscreen com padding consistente.

## 4. Tela Cartão — `CheckoutStepCard.tsx`

- **Remover** o bloco "Resumo do pedido" interno (o usuário já viu na tela anterior).
- Mostrar apenas no topo um cabeçalho mínimo: **"Total: R$ X,XX"** (com desconto do cupom se houver).
- Formulário do cartão mantém os mesmos campos, mas com espaçamento melhor para mobile (inputs maiores, agrupamento Validade/CVV em grid).
- Botão "Pagar R$ X,XX" fixo no rodapé do fullscreen.

## 5. Cupons de desconto — novo módulo

### Banco de dados (migration)
Criar tabela `event_coupons`:
```text
id (uuid pk)
event_id (uuid fk events)
code (text, único por evento, normalizado upper)
discount_type ('percent' | 'fixed')
discount_value (numeric)
max_uses (int, nullable)
uses_count (int default 0)
valid_until (timestamptz, nullable)
is_active (boolean default true)
created_at, updated_at
```
- RLS:
  - SELECT público para cupons ativos (necessário para validar no checkout) — ou via Edge Function (preferido, ver abaixo).
  - INSERT/UPDATE/DELETE só para o produtor dono do evento (via `producer_profile_id`).
- Índice único em `(event_id, upper(code))`.

### Edge Function `validate-coupon`
- Input: `{ eventId, code }`.
- Retorna: `{ valid, discountType, discountValue, message }`.
- Verifica: existe, ativo, não expirado, `uses_count < max_uses`.
- Mantém RLS fechada e evita brute-force expondo a tabela.

### UI do produtor — nova aba "Cupons" no `EventDashboard`
- Adicionar tab **"Cupons"** ao lado de "Pedidos", "Participantes", etc.
- Componente `EventCouponsTab.tsx`:
  - Lista de cupons do evento com código, tipo, valor, usos/limite, validade, status (ativo/inativo) e ações editar/excluir.
  - Botão "Novo cupom" abre dialog com: código, tipo (percentual/valor fixo), valor, limite de usos (opcional), validade (opcional), ativo.
- Hook `useEventCoupons(eventId)` (CRUD via Supabase, padrão `useEventLots`).

### Aplicação no checkout
- `CheckoutStepPayment` chama `validate-coupon` ao clicar "Aplicar".
- `CheckoutModal` mantém `appliedCoupon` no estado e passa o `discountAmount` para `CheckoutStepCard` e para a criação do pedido.
- `create-mercadopago-pix` e `process-card-payment` recebem `couponId` opcional; ao confirmar pagamento, incrementam `uses_count` e armazenam `coupon_id` no `orders` (adicionar coluna `coupon_id` e `discount_amount` em `orders` na mesma migration).

## 6. Detalhes técnicos

- `useIsMobile` já existe (`src/hooks/use-mobile.tsx`) — usar em `CheckoutModal`.
- Para fullscreen no Dialog do Radix, sobrescrever classes do `DialogContent`:
  ```text
  isMobile && "max-w-none w-screen h-screen rounded-none p-0 sm:max-w-none"
  ```
- Conteúdo interno passa a usar `flex flex-col h-full` com header fixo, área central `flex-1 overflow-y-auto` e rodapé de ação (quando aplicável) fixo.

## Arquivos afetados

**Editados:**
- `src/components/checkout/CheckoutModal.tsx` (fullscreen, header, remoção do step indicator, estado do cupom)
- `src/components/checkout/CheckoutStepPayment.tsx` (cupom + auto-avanço)
- `src/components/checkout/CheckoutStepPix.tsx` (layout premium, QR sem logo, copy full-width)
- `src/components/checkout/CheckoutStepCard.tsx` (remover resumo duplicado, layout fullscreen)
- `src/pages/EventDashboard.tsx` (adicionar tab "Cupons")
- `supabase/functions/create-mercadopago-pix/index.ts` e `process-card-payment/index.ts` (aceitar `couponId`, aplicar desconto, incrementar uso)

**Criados:**
- `supabase/migrations/<timestamp>_event_coupons.sql` (tabela + RLS + colunas em `orders`)
- `supabase/functions/validate-coupon/index.ts`
- `src/hooks/useEventCoupons.ts`
- `src/components/producer/tabs/EventCouponsTab.tsx`
- `src/components/producer/CouponDialog.tsx`

Sem mudança no fluxo de autenticação nem no `AuthModal`.
