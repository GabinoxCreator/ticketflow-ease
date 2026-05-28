
# Fase 10 — Detecção de entrega parcial/falha em mesa (revisado)

## Escopo

Detectar + alertar quando o webhook MP confirma pagamento aprovado mas a entrega de assentos não foi completa. **Não** chama refund, **não** solta assento, **não** mexe em dinheiro. Produtor revisa e age na mão.

Dois sabores:

- **(a) Promoção parcial**: order ainda `pending`, RPC promove, mas alguns `event_seats` foram perdidos no race (hold expirou e outro pegou).
- **(b) Pagamento sem entrega**: webhook chega `approved` com `transaction_amount` batido, **mas** a order já não está `pending` (foi `expired`/`failed`/`cancelled` pelo `expire-pending-orders`) — RPC bloqueia, dinheiro entrou, nada entregue.

Ingresso (lot-based) fica fora.

---

## 1) Schema (migration)

Adicionar à tabela `orders`:

- `review_status text` — `NULL` (ok), `'partial_delivery'`, `'paid_no_delivery'`.
- `review_reason jsonb` — `{expected, delivered, mp_payment_id, transaction_amount, detected_at, flavor}`.
- `review_flagged_at timestamptz`.

Index parcial `WHERE review_status IS NOT NULL`.

`orders.status` **não muda** — finanças seguem lendo `status='paid'`. A flag é canal separado.

---

## 2) Sabor (a) — dentro de `apply_order_approved` (RPC)

Detecção **na mesma transação** da promoção, comparando estado atual (idempotente):

```sql
_expected_seats := (
  SELECT count(DISTINCT event_seat_id)
    FROM tickets
   WHERE order_id = _order_id AND event_seat_id IS NOT NULL
);

IF _expected_seats > 0 THEN
  _delivered_seats := (
    SELECT count(DISTINCT id) FROM event_seats
     WHERE order_id = _order_id AND status = 'sold'
  );

  IF _delivered_seats < _expected_seats THEN
    UPDATE orders
       SET review_status = 'partial_delivery',
           review_reason = jsonb_build_object(
             'expected', _expected_seats,
             'delivered', _delivered_seats,
             'mp_payment_id', _mp_payment_id,
             'detected_at', now(),
             'flavor', 'a_partial'
           ),
           review_flagged_at = now()
     WHERE id = _order_id AND review_status IS NULL;

    IF FOUND THEN
      INSERT INTO audit_logs(...) VALUES (..., 'order_partial_delivery_detected', ...);
    END IF;
  END IF;
END IF;
```

Inserido nos **dois ramos** que mexem em seats: `IF _order.status='pending'` (após promoção) **e** `ELSIF _order.status='paid'` (sweep de reentrega). Em ambos a comparação é estado atual + `WHERE review_status IS NULL` → reentrega é no-op.

**Não** solta assentos parcialmente entregues. Decisão do produtor.

---

## 3) Sabor (b) — NO WEBHOOK, depois do gate approved+amount

**Mudança chave em relação ao plano anterior**: o flag (b) **sai do ramo ELSE da RPC** e vai pro `mercadopago-webhook/index.ts`, **depois** que o webhook já validou:

1. `mpStatus === 'approved'`
2. `Math.abs(expected - received) <= 0.01` (amount batido)

Ou seja, no mesmo bloco onde hoje chama `applyOrderApproved`. Sequência:

```ts
// dentro de if (mpStatus === 'approved') { ... } depois do amount check:

await supabase.from('orders').update({ mp_payment_id: paymentId }).eq('id', order.id);

const result = await applyOrderApproved(supabase, { orderId, mpPaymentId, source });

// NOVO: sabor (b) — só dispara aqui porque chegamos depois de:
//   • mpStatus === 'approved'
//   • transaction_amount bateu com order.total_amount
//   • mp_webhook_events já fez dedupe (UNIQUE mp_payment_id+mp_status)
// Logo: pagamento REAL e confirmado pelo MP, sem chance de PIX abandonado.
if (result.mismatch && result.order_status && result.order_status !== 'paid') {
  // RPC bloqueou porque order não estava pending nem paid (expired/failed/cancelled).
  // Só flaggar se a order tem tickets de mesa (event_seat_id IS NOT NULL).
  await supabase.rpc('flag_order_paid_no_delivery', {
    _order_id: order.id,
    _mp_payment_id: paymentId,
    _transaction_amount: received,
    _order_status: result.order_status,
  });
}
```

Nova RPC `flag_order_paid_no_delivery` (security definer), curta:

```sql
-- só flagga se tem tickets de mesa E ainda não está flagged (idempotente)
UPDATE orders
   SET review_status = 'paid_no_delivery',
       review_reason = jsonb_build_object(
         'order_status', _order_status,
         'mp_payment_id', _mp_payment_id,
         'transaction_amount', _transaction_amount,
         'detected_at', now(),
         'flavor', 'b_terminal'
       ),
       review_flagged_at = now()
 WHERE id = _order_id
   AND review_status IS NULL
   AND EXISTS (
     SELECT 1 FROM tickets
      WHERE order_id = _order_id AND event_seat_id IS NOT NULL
   );

-- audit só se FOUND
```

**O ramo `ELSE` da RPC `apply_order_approved` NÃO ganha flag nenhuma.** Continua só com o audit `apply_order_approved_terminal_mismatch` existente (essa é a fonte de diagnóstico interno; não vira alerta de dinheiro até o webhook confirmar amount).

### Por que isto elimina o falso positivo

| Cenário | Webhook chega? | mpStatus | amount bate? | Flag (b)? |
|---|---|---|---|---|
| PIX abandonado, order virou expired | Não | – | – | Não — webhook nem roda |
| PIX abandonado, MP manda webhook `cancelled` | Sim | cancelled | – | Não — não entra no ramo approved |
| Pagamento aprovado mas amount divergente | Sim | approved | Não | Não — webhook devolve `amount_mismatch` antes de chamar RPC |
| Pagamento aprovado, amount ok, order ainda pending | Sim | approved | Sim | Sabor (a) cuida via RPC |
| Pagamento aprovado, amount ok, order já expired | Sim | approved | Sim | **Sim — sabor (b), dinheiro real entrou** |
| Reentrega de qualquer caso (dedupe UNIQUE) | – | – | – | Não — `mp_webhook_events.insert` retorna 23505 antes de chegar na lógica |

A guarda extra `EXISTS tickets event_seat_id IS NOT NULL` na RPC do flag garante que ingresso não é flaggado por engano.

---

## 4) Alerta — canal: dashboard do produtor

Sem email nesta fase. Só visual no dashboard:

- `useEventOrders.ts`: selecionar `review_status`, `review_reason`, `review_flagged_at`; adicionar ao tipo `Order`.
- `OrderListItem.tsx`: badge vermelho `Revisar pagamento` quando `review_status != null`, com tooltip:
  - sabor (a): "Pagamento confirmado, mas só X de Y assentos foram entregues. Verifique no Mercado Pago e reembolse a diferença manualmente se necessário."
  - sabor (b): "Pagamento confirmado no Mercado Pago, mas o pedido expirou antes da confirmação. Nenhum assento foi entregue. Verifique e reembolse manualmente no painel do MP."
- `EventDashboard.tsx` (aba Pedidos): chip vermelho no topo "N pedidos com problema" quando count > 0.

Order continua aparecendo no fluxo normal — flag é overlay informativo.

---

## 5) Resolução manual

Não tem UI de "resolver" nesta entrega. Produtor reembolsa no painel do MP; flag fica como histórico. Próxima fase pode adicionar botão "Marcar como resolvido".

---

## 6) Arquivos

**Migrations:**
- `ALTER TABLE orders ADD review_status / review_reason / review_flagged_at` + index parcial.
- `CREATE OR REPLACE FUNCTION apply_order_approved` com bloco de detecção (a) nos 2 ramos (pending e paid). Ramo ELSE intocado.
- `CREATE FUNCTION flag_order_paid_no_delivery(...)` — security definer, idempotente.

**Edge:**
- `supabase/functions/mercadopago-webhook/index.ts`: após `applyOrderApproved`, se `result.mismatch && order_status !== 'paid'`, chama `flag_order_paid_no_delivery`.

**Front:**
- `src/hooks/useEventOrders.ts`: tipos e select.
- `src/components/producer/OrderListItem.tsx`: badge + tooltip.
- `src/pages/EventDashboard.tsx` (aba Pedidos): contador.

**Não toca:** `_shared/applyOrderApproved.ts`, `expire-pending-orders`, `release_seats_for_order`, `confirm_seats`.

---

## 7) Garantias

- **Idempotência por estado atual**: ambos sabores comparam estado vs `WHERE review_status IS NULL`. Reentrega é no-op.
- **Gate de dinheiro real**: sabor (b) só dispara depois de `approved + amount match + dedupe MP`. Sem falso positivo de PIX abandonado.
- **Sem auto-refund, sem auto-release**: produtor decide.
- **Finanças não mudam**: order continua `paid` (sabor a) ou terminal (sabor b); cálculo de repasse não é afetado por esta fase. Se produtor reembolsar no MP, webhook `refunded` cuida do resto pelo fluxo existente.

---

## 8) Aberto pra revisão

1. Filtrar flag fora do repasse no `useProducerFinance`? Proposta: **não** — produtor lida na mão; reembolso real vira `status='refunded'` e cai do cálculo sozinho.
2. Email diário com resumo das flags não-resolvidas — fica pra fase futura.
