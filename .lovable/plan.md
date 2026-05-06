# B6.1 — Notificação pós-pagamento idempotente

## 1. Diagnóstico do estado atual

Hoje um pedido pode virar `paid` em três caminhos distintos, todos já com transição idempotente via `UPDATE ... WHERE status='pending'`:

- `process-card-payment` (cartão tokenizado, síncrono) — confirma e marca `paid` quando MP aprova.
- `check-mercadopago-payment` (polling do front, ex.: PIX e retorno do checkout) — confirma `paid` se MP retornar `approved`.
- `mercadopago-webhook` (assíncrono, oficial) — fonte de verdade; também marca `paid`.

Pontos confirmados:
- `CheckoutStepSuccess` afirma "enviamos por e-mail" mas **não há envio real**. Hoje só existem emails de OTP (`send-verification-code`, `send-password-reset-code`) usando Resend (`naoresponda@festpag.com.br`).
- `orders.user_id` e `tickets.user_id` podem ser nulos (claim será tratado em outro bloco).
- Os três pontos de confirmação são potencialmente concorrentes: webhook + polling + cartão podem todos disparar para o mesmo `order_id`. Sem idempotência, geraria emails duplicados.
- Já existe a tabela `mp_webhook_events` com `unique(mp_payment_id, mp_status)` que serializa idempotência do webhook, mas isso **não cobre** os outros dois caminhos.

## 2. Como disparar email sem duplicidade

Princípio: o envio nunca deve ocorrer no caminho síncrono de confirmação diretamente. Em vez disso:

1. Cada caminho de confirmação que faz a transição `pending -> paid` chama uma única edge function `send-order-confirmation-email` com `order_id`.
2. Essa função executa um **claim atômico** numa nova tabela `order_email_notifications` antes de qualquer envio. Se outro caminho já reservou o slot, ela retorna `already_sent` e não envia.
3. Só depois do claim bem sucedido a função carrega dados, chama Resend e atualiza o registro com `sent_at` / `resend_message_id`.

Isso garante: **um envio por order_id**, mesmo com 3 callers em paralelo.

Importante: o claim deve ser feito **fora da transação** que muda `orders.status`, mas **somente quando o `UPDATE` retornou linha alterada** (i.e. somente o caller que efetivamente fez `pending -> paid` deve invocar). Os outros callers que viram "no-op" não chamam, evitando ruído. Mesmo assim, o claim é a defesa final.

## 3. Modelagem de idempotência

Nova tabela:

```sql
create table public.order_email_notifications (
  order_id uuid primary key,
  kind text not null default 'paid_confirmation',
  status text not null default 'pending', -- pending | sent | failed
  attempts int not null default 0,
  last_error text,
  resend_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.order_email_notifications enable row level security;
-- só admins leem; service role escreve
create policy "Admins view notifications" on public.order_email_notifications
  for select to authenticated using (has_role(auth.uid(), 'admin'));
```

Claim atômico dentro da edge function (service role):

```sql
insert into order_email_notifications (order_id, status, attempts)
values ($1, 'pending', 1)
on conflict (order_id) do nothing
returning order_id;
```

- Se retornou linha → este worker tem o lock e procede com envio.
- Se retornou vazio → outro worker já claimou; sair com `{ skipped: true, reason: 'already_claimed' }`.

Após Resend OK: `update ... set status='sent', sent_at=now(), resend_message_id=...`.
Se Resend falhar: `update ... set status='failed', last_error=...`. Política: para v1 não fazemos retry automático (admin pode reenviar manualmente futuramente). Cron de retry fica fora deste bloco.

## 4. Arquivos / edge functions / tabelas impactados

**Novo:**
- Migration: tabela `order_email_notifications`.
- Edge function `send-order-confirmation-email/index.ts` (`verify_jwt = false`, autenticada por chamada interna com service role; valida `order_id`).
- Entrada em `supabase/config.toml` para a nova função.

**Modificados (apenas adicionando 1 chamada `functions.invoke` após a transição confirmada):**
- `supabase/functions/process-card-payment/index.ts` — após `update ... status='paid'` retornar linha.
- `supabase/functions/check-mercadopago-payment/index.ts` — dentro do bloco `if (updatedOrder)` no caminho `targetOrderId`, e também no caminho fallback por `paymentId`.
- `supabase/functions/mercadopago-webhook/index.ts` — dentro do bloco `if (changed)` da transição approved.

A invocação é fire-and-forget (`.catch(log)`), nunca bloqueia o fluxo crítico de pagamento.

**Não alterado:**
- `CheckoutStepSuccess.tsx` (já mostra a mensagem correta).
- Nenhuma tabela de orders/tickets.

## 5. Riscos de regressão

- **Falha do Resend bloquear pagamento**: mitigado por fire-and-forget + try/catch.
- **Race entre webhook e polling chamando a função simultaneamente**: mitigado pelo claim único (`on conflict do nothing`).
- **Order sem email do cliente**: improvável (`customer_email` é NOT NULL nos fluxos atuais), mas a função valida e retorna 200 sem enviar se faltar.
- **Custo extra de chamadas a Resend**: 1 email por pedido pago. Aceitável.
- **Domain reputation**: já usamos `festpag.com.br` no Resend para OTP — mesmo sender, mesmo padrão visual.
- **RLS**: nada novo exposto ao client; tabela só lida por admin.

## 6. Plano em blocos pequenos

- **B6.1.a** — Migration: criar `order_email_notifications` + RLS.
- **B6.1.b** — Edge function `send-order-confirmation-email` (claim + load + Resend + update). Registrar em `config.toml`.
- **B6.1.c** — Hook em `process-card-payment` (1 invoke após `paid`).
- **B6.1.d** — Hook em `check-mercadopago-payment` (dois pontos: targetOrderId e fallback).
- **B6.1.e** — Hook em `mercadopago-webhook` (bloco approved aplicado).
- **B6.1.f** — Validação manual + observabilidade (logs `[SEND-ORDER-EMAIL]`).

Cada bloco é reversível isoladamente.

## 7. Checklist manual de validação

1. Comprar com cartão aprovado → 1 email recebido em até 5s; `order_email_notifications.status='sent'`.
2. Comprar com PIX, simular pagamento → webhook chega antes do polling: 1 email; polling subsequente loga `already_claimed`.
3. Forçar polling antes do webhook (PIX rápido) → 1 email; webhook subsequente loga `already_claimed`.
4. Reprocessar webhook duplicado MP (mesmo `payment_id`) → nenhum email extra (dedupe já existente em `mp_webhook_events`).
5. Pedido com `customer_email` faltando → função retorna 200, registro fica `failed` com `last_error='missing_email'`, sem crash.
6. Resend simulado offline → registro `failed`, pedido segue `paid` normalmente, fluxo de checkout não afetado.
7. Email contém: nome do evento, qtd ingressos, total, status `Pago`, link para `/meus-ingressos`, fallback textual quando `user_id` é null ("seus ingressos foram vinculados ao email X — faça login com este email para acessá-los").
8. Cartão recusado → nenhum email enviado.

## 8. Parecer final

**Aprovado para implementação** após sua confirmação. Solução respeita:
- idempotência real por `order_id` via constraint de PK,
- compatibilidade com produção (fire-and-forget, sem mudar fluxo de pagamento),
- canal Resend já existente no projeto,
- escopo limitado: nada de claim de tickets órfãos, nada de WhatsApp.

Aguardo aprovação para abrir B6.1.a.
