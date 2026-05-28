# Exibir taxa de conveniência no resumo do checkout

## Problema
O resumo do pedido (`SeatOrderSummary`) mostra apenas o subtotal dos assentos (ex.: R$ 80,00). O QR Code do PIX é gerado com o valor + taxa (10% = R$ 88,00) porque a edge `create-seat-pix` calcula `serviceFee` via `get_event_fee` e grava em `seat_orders.total_amount`. O front nunca lê essa taxa, então aparece R$ 80,00 no card e R$ 88,00 no QR — assustando o cliente.

## Causa raiz
`src/pages/SeatCheckout.tsx:191-199` calcula `totalAmount` localmente somando apenas `base_price + extra_price * addons`. Não busca a taxa do evento. `SeatOrderSummary` recebe só esse subtotal.

## Fix (somente front)

**1. `src/pages/SeatCheckout.tsx`**
- Buscar a taxa do evento ao carregar (`useEffect` que chama `supabase.rpc('get_event_fee', { _event_id, _method: 'pix' })`). Fallback: `{ percent: 10, fixed: 0 }` se o RPC não retornar (mesma constante usada nas edges).
- Guardar em estado: `feePercent`, `feeFixed`.
- Derivar `subtotal` (o atual `totalAmount`), `serviceFee = round2(subtotal * feePercent/100 + feeFixed)`, `totalWithFee = subtotal + serviceFee`.
- Passar `subtotal`, `serviceFee`, `totalWithFee` para `SeatOrderSummary`.
- Manter `totalAmount` (= `totalWithFee`) para o card step e demais consumidores que já esperam o "valor a pagar".

**2. `src/components/checkout/SeatOrderSummary.tsx`**
- Aceitar novas props: `subtotal: number`, `serviceFee: number`, `totalAmount: number` (= total com taxa).
- Renderizar 3 linhas antes do divisor:
  - Subtotal — `R$ 80,00`
  - Taxa de conveniência — `R$ 8,00` (texto muted, ícone pequeno opcional)
  - **Total** — `R$ 88,00` (gradient bold como hoje)
- Manter compatibilidade: o componente também é usado no resumo da PIX step e card step.

**3. Verificação**
- Comparar valor exibido no resumo vs valor cobrado no QR PIX (`data.amount` retornado por `create-seat-pix`) — devem bater. Logar warning no console em dev se divergirem.
- `tsc --noEmit` limpo.

## Edges, RLS, e fluxo de pagamento
Intocados. Só leitura via RPC `get_event_fee` (já existe e é segura).
