## Fix cirúrgico do gate de render no SeatCheckout

**Raiz (confirmada na Fase 1):** `src/pages/SeatCheckout.tsx:424` exige `hold` para qualquer render. Em `handlePaymentConfirmed` (linha 340-344), `clearLocalHold()` zera `hold` antes de `setStep('success')` — o gate engole a tela de success e mostra spinner de página inteira para sempre. Mesmo bug atinge o efeito de idempotência (386-407) ao recarregar com order paga.

### Mudança 1 — gate de render (linhas 424-431)

Antes:
```tsx
if (!hold || !event || !customer || step === null) {
  return <spinner />;
}
```

Depois:
```tsx
// Steps terminais não dependem do hold (já foi limpo após pagamento).
// Só dependem de event + orderId/resultado. Esses precisam renderizar mesmo
// com hold=null — senão o gate engole 'success' e fica em spinner eterno.
const isTerminalStep = step === 'success' || step === 'verifying';
if (!event || !customer || step === null || (!isTerminalStep && !hold)) {
  return <spinner />;
}
```

`hold` só é exigido em steps ativos (`form`, `cpf`, `method`, `pix`, `card`, `awaiting`). `success` e `verifying` passam pelo gate mesmo com `hold = null`.

### Mudança 2 — `ReservedPill` na linha 448

Antes:
```tsx
{step !== 'success' && <ReservedPill expiresAt={hold.expiresAt} />}
```

Depois:
```tsx
{hold && !isTerminalStep && <ReservedPill expiresAt={hold.expiresAt} />}
```

Sem isso, `hold.expiresAt` quebra no step `verifying` quando o hold já foi limpo. A pílula só faz sentido enquanto a reserva está ativa.

### O que NÃO muda

- `handlePaymentConfirmed` continua chamando `clearLocalHold()` (correto — após pagar não há mais reserva pra liberar).
- Efeito de idempotência (386-407) continua igual; com o novo gate, `setStep('success')` agora renderiza mesmo com `hold = null`.
- Edges (`create-seat-pix`, `mercadopago-webhook`, `check-mercadopago-payment`) intocadas — Fase 1 itens 1 e 2 provaram que `external_reference == orders.id` e RLS do cliente está correta.
- Nada de logs temporários (a instrumentação não chegou a ser aplicada — `console.log` em `SeatCheckout.tsx` e `CheckoutStepPix.tsx` já está vazio, confirmado via `rg`).

### Validação manual (Gabriel)

- PIX aprovado → tela de Success (não spinner).
- Recarregar `/checkout/mesa/:id` após pago → idempotência leva direto a Success, sem repedir pagamento.
- Cartão aprovado / `approved_pending` → tela Success após webhook.

### Técnico

- 1 arquivo: `src/pages/SeatCheckout.tsx`.
- 2 edits cirúrgicos (linhas 424-431 e linha 448).
- `tsc --noEmit` rodará limpo (`isTerminalStep` é boolean simples, `Step` já inclui 'success' e 'verifying').
- Sem migration, sem mudança em edges, sem alteração no `useSeatHold`.