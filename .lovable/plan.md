
# Auditoria de Pagamentos FestPag e Plano de Migração para PagBank

> Apenas auditoria, mapeamento e plano. **Nada será implementado neste passo.**

---

## 1. Resumo executivo da auditoria de pagamentos atual

A camada de pagamentos do FestPag está madura, defensiva e bem desenhada — mas **fortemente acoplada ao Mercado Pago (MP)**, tanto no backend (Edge Functions) quanto no frontend (SDK `sdk.mercadopago.com/js/v2`) e no schema (`orders.mp_payment_id`, tabela `mp_webhook_events`).

Pontos fortes que devem ser preservados:

- **Reserva atômica de inventário** via RPC (`reserve_lot_quantity` / `confirm_lot_sale` / `release_lot_quantity`) — regra crítica do FestPag, totalmente desacoplada do gateway.
- **Promoção `pending → paid` centralizada** num único ponto: a função SQL `apply_order_approved` chamada pelo helper `_shared/applyOrderApproved.ts`. Idempotente, com hard-guard contra "paid sem tickets".
- **Triplo mecanismo de confirmação**: webhook (fonte da verdade) + polling autenticado (`check-mercadopago-payment`) + cron de expiração com revalidação MP (`expire-pending-orders`) + reconciliação admin (`reconcile-orphan-orders`).
- **Validação cruzada obrigatória** em todo ponto que promove pedido: `external_reference == order.id` E `transaction_amount == order.total_amount`.
- **Mutação manual de `orders.status` no client está desabilitada** (`useEventOrders.ts`) — boa prática.
- **Endpoint legado neutralizado** (`create-mercadopago-preference` → 410 Gone).

Pontos frágeis para a migração:

- A coluna `orders.mp_payment_id` e a tabela `mp_webhook_events` carregam o nome do provedor no schema.
- O frontend importa o SDK MP diretamente no `index.html` e usa `window.MercadoPago` para tokenizar cartão e calcular parcelas.
- O helper de status (`deriveView` em `CheckoutSuccess.tsx`) e a UX de `awaiting/pix/card` espelham a taxonomia de status do MP (`approved`, `in_process`, `pending`, `rejected`, `cancelled`).
- A reconciliação legacy (`decrement_sold_quantity_legacy`, marca `BLOCK1_DEPLOY`) revela que já houve uma migração delicada anterior — o mesmo cuidado precisa ser repetido.

**Parecer geral:** a base está pronta para migrar, **desde que a migração seja feita por uma camada de abstração de provider**, e não trocando MP por PagBank linha-a-linha.

---

## 2. Fluxo atual do FestPag

```text
┌─────────────────────────────────────────────────────────────────┐
│ CHECKOUT (browser)                                              │
│  CheckoutModal → CheckoutStepCard / CheckoutStepPix             │
│  - tokeniza cartão via window.MercadoPago (createCardToken)     │
│  - calcula parcelas via mp.getInstallments                      │
└──────────────┬─────────────────────────────────┬────────────────┘
               │ PIX                             │ CARTÃO
               ▼                                 ▼
   create-mercadopago-pix             process-card-payment
   (verify_jwt)                       (verify_jwt)
   1) valida CPF                      1) valida CPF
   2) valida event/lots               2) valida event/lots
   3) reserve_lot_quantity (RPC)      3) reserve_lot_quantity (RPC)
   4) cria order pending              4) cria order pending
      + tickets pending                  + tickets pending
   5) cria pagamento PIX no MP        5) POST /v1/payments com cardToken
   6) salva mp_payment_id             6) se approved → applyOrderApproved
                                         se in_process → aguarda webhook
                                         se rejected  → release + failed

               │
               ▼
   ┌─────────────────────────────────────────────┐
   │ CONFIRMAÇÃO  (3 caminhos convergentes)      │
   ├─────────────────────────────────────────────┤
   │ A) mercadopago-webhook (autoritativo)       │
   │    - valida assinatura HMAC                 │
   │    - dedupe via mp_webhook_events           │
   │    - valida amount + external_reference     │
   │    - applyOrderApproved()                   │
   │                                             │
   │ B) check-mercadopago-payment (polling)      │
   │    - chamado por CheckoutSuccess + modal    │
   │    - só promove se JWT == order.user_id     │
   │                                             │
   │ C) expire-pending-orders (cron 1/min)       │
   │    - revalida no MP antes de expirar        │
   │    - estende janela se in_process           │
   │    - hard cap 180min                        │
   └─────────────────────────────────────────────┘
                       │
                       ▼
   apply_order_approved (SQL, transacional)
   - orders.status: pending → paid
   - tickets: pending → valid
   - confirm_lot_sale por lote (reserved → sold)
   - event_coupons.uses_count += 1
   - hard-guard: nunca promove paid sem tickets
                       │
                       ▼
   sendOrderConfirmationEmailSafe → /meus-ingressos
                       │
                       ▼
   Check-in (collaborator-validate-ticket) lê
   tickets.status = 'valid'
```

---

## 3. Pontos acoplados ao provedor atual (Mercado Pago)

### Backend (Edge Functions)
- `create-mercadopago-pix/index.ts` — chama `POST https://api.mercadopago.com/v1/payments` com `payment_method_id: 'pix'`, lê `point_of_interaction.transaction_data.qr_code`.
- `process-card-payment/index.ts` — chama `POST /v1/payments` com `cardToken`, `installments`, `issuer_id`, `payment_method_id` (taxonomia MP).
- `check-mercadopago-payment/index.ts` — `GET /v1/payments/{id}`, compara `external_reference`, `transaction_amount`.
- `mercadopago-webhook/index.ts` — assinatura HMAC com manifest `id:..;request-id:..;ts:..;`, status `approved/rejected/cancelled/refunded/charged_back`.
- `expire-pending-orders/index.ts` — revalida `GET /v1/payments/{id}` antes de expirar.
- `reconcile-orphan-orders/index.ts` — varredura admin via `GET /v1/payments`.
- `get-mercadopago-public-key/index.ts` — devolve a public key do MP.
- `create-mercadopago-preference/index.ts` — legado neutralizado (410).
- `_shared/applyOrderApproved.ts` — assinatura `mpPaymentId: string` (nome acoplado, lógica genérica).

### Frontend
- `index.html` — `<script src="https://sdk.mercadopago.com/js/v2" defer>`.
- `src/components/checkout/CheckoutStepCard.tsx` — `window.MercadoPago`, `createCardToken`, `getInstallments`.
- `src/components/checkout/CheckoutModal.tsx` — invoca `create-mercadopago-pix` e `check-mercadopago-payment` por nome.
- `src/pages/CheckoutSuccess.tsx` — `deriveView` mapeia status MP (`approved`, `in_process`, `pending`, `rejected`).
- `src/hooks/useEventOrders.ts` — enum de status reflete vocabulário MP (`charged_back`).

### Schema / DB
- `orders.mp_payment_id` (text) — chave canônica do provedor.
- Tabela `mp_webhook_events` — dedupe por `mp_payment_id` + `mp_status`.
- `audit_logs.action` com strings tipo `apply_order_approved_*`, `mp_*`, `check_payment_*`.

### Secrets / config
- `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `VITE_MERCADOPAGO_PUBLIC_KEY`.
- `supabase/config.toml` — blocos `[functions.create-mercadopago-*]`, `[functions.mercadopago-webhook]`.

---

## 4. Regras de negócio que devem permanecer intactas

Estas regras **não são do MP** — são do FestPag e devem sobreviver à migração sem alteração:

1. **Reserva atômica de inventário antes de criar pedido**: `reserve_lot_quantity` falha se `(sold + reserved + qty) > total`. Sem isso, oversell.
2. **Pedido + tickets criados em estado `pending`**, nunca como `valid` antes do pagamento confirmado.
3. **Promoção `pending → paid` centralizada em `apply_order_approved`** (SQL), com:
   - Hard-guard: nunca promove para `paid` se `count(tickets)=0`.
   - Idempotência: re-execução só repara tickets pendentes, sem mexer em inventário/cupom.
   - `event_coupons.uses_count` incrementa **apenas na primeira transição**.
4. **Validação cruzada obrigatória**: `external_reference == order.id` E `transaction_amount == order.total_amount` antes de qualquer promoção.
5. **Polling não-autoritativo a menos que o JWT seja o dono do pedido** (`authedUserId === order.user_id`).
6. **Webhook é a fonte da verdade**; polling apenas reflete; cron apenas revalida e cobre janelas perdidas.
7. **Hard cap de 180 min** para pedidos `in_process` antes de forçar expiração + liberar inventário.
8. **CPF obrigatório e validado** antes de qualquer reserva (`unformatCPF` + `validateCPF`).
9. **Cupom**: aplicado no servidor em `pending`, contabilizado **só após `paid`**.
10. **Ticket só vira `valid` via `apply_order_approved`** — nunca diretamente.
11. **Status de pedido nunca é mutado pelo cliente** (`useEventOrders.updateOrderStatus` desabilitado).
12. **Liberação de reserva em rejeição/expiração** é obrigatória (`release_lot_quantity`).
13. **Check-in só aceita `tickets.status='valid'`** dentro da janela `is_event_checkin_open`.
14. **Refund/chargeback** marca o pedido mas **exige revisão manual de inventário** (já logado em `audit_logs`).

---

## 5. Riscos de migração

- **Oversell** se a reserva atômica não for replicada na nova ponta.
- **Pedidos órfãos**: pagamento aprovado no PagBank sem `apply_order_approved` rodar (webhook perdido + polling ausente).
- **Promoção duplicada** se a dedupe (`mp_webhook_events`) não for generalizada para o novo provider.
- **Vazamento de inventário** se a expiração não revalidar contra o PagBank antes de liberar.
- **Cupons supercontabilizados** se a idempotência de `apply_order_approved` não for respeitada.
- **Migração de pedidos em voo durante o cutover** (PIX MP gerado às 23:59, pago às 00:01 já no PagBank).
- **Quebra do check-in** se algum ticket ficar preso em `pending` após a troca.
- **Diferenças de taxonomia de status** PagBank vs MP (PagBank: `PAID/AUTHORIZED/IN_ANALYSIS/DECLINED/CANCELED/...`).
- **PIX expira de forma diferente** — janelas e formato de QR podem mudar a UX do `CheckoutStepPix`.
- **Tokenização de cartão**: o SDK PagBank tem API distinta — pode quebrar `getInstallments`/`createCardToken`.
- **Assinatura de webhook diferente** (HMAC manifest MP vs cabeçalho próprio do PagBank).
- **Idempotency keys**: hoje usamos `order.id` / `card-${order.id}`; PagBank usa `referenceId` próprio.
- **Antifraude**: regras de recusa diferentes vão alterar a taxa de aprovação.
- **3DS / autenticação adicional** no cartão PagBank pode mudar a UX.
- **Reembolso/estorno** PagBank tem fluxo distinto; o vocabulário de status precisa acomodar.

---

## 6. Arquitetura-alvo recomendada para PagBank

Princípio: **introduzir uma camada `PaymentProvider` (interface)** entre as Edge Functions e o gateway. As funções do FestPag passam a ser agnósticas, e cada provider implementa o contrato.

```text
                    ┌──────────────────────────────────┐
                    │   Edge Functions de domínio       │
                    │   (orquestração FestPag — fixas)  │
                    │   create-pix-order                │
                    │   create-card-order               │
                    │   check-payment                   │
                    │   payments-webhook                │
                    │   expire-pending-orders           │
                    │   reconcile-orphan-orders         │
                    └────────────┬─────────────────────┘
                                 │
                  ┌──────────────▼──────────────┐
                  │  _shared/payments/Provider   │
                  │  interface IPaymentProvider  │
                  │  - createPix(order)          │
                  │  - chargeCard(order, token)  │
                  │  - fetchPayment(id)          │
                  │  - verifyWebhook(req)        │
                  │  - normalizeStatus(raw)      │
                  └──────┬───────────────┬──────┘
                         │               │
              ┌──────────▼──┐      ┌─────▼─────────┐
              │ MPProvider  │      │ PagBankProvider│
              │ (legado)    │      │ (novo)         │
              └─────────────┘      └────────────────┘
```

Mudanças de schema sugeridas (compatíveis com legado, sem renomear nada agora):

- Manter `orders.mp_payment_id` e adicionar `orders.payment_provider` (`'mercadopago' | 'pagbank'`) e `orders.provider_payment_id` (text). Backfill: copiar `mp_payment_id` para `provider_payment_id` com provider `mercadopago`.
- Renomear semanticamente `mp_webhook_events` para algo neutro (`payment_webhook_events`) com coluna `provider`. Manter view legada se necessário.
- `apply_order_approved` aceita `_provider text` opcional (default `mercadopago`).

Frontend:

- Carregar dinamicamente o SDK do provider ativo via flag lida em runtime de `platform_settings` (ex.: `payment_provider = 'pagbank'`).
- `CheckoutStepCard` vira um wrapper que importa `tokenizeCard()` do adapter ativo.
- `deriveView` passa a operar sobre **status normalizado** (`paid/pending/in_process/failed/rejected/expired`), não sobre status bruto do gateway.

---

## 7. Recomendação de estratégia: hospedado, transparente ou híbrido

**Recomendação: TRANSPARENTE (igual ao modelo atual), com fallback opcional para link de pagamento PagBank.**

Justificativa:

- O FestPag já tem UX transparente (PIX QR no modal, cartão tokenizado inline). Voltar para checkout hospedado seria **regressão de UX e de conversão**.
- A camada de inventário/reserva **exige** controle do momento exato de criação do pedido — incompatível com hospedado puro (onde o pedido só nasce no retorno).
- PagBank suporta o modelo transparente:
  - **PIX**: `POST /orders` com `qr_codes` → recebemos `text` (copia-e-cola) e `links[]` (imagem do QR).
  - **Cartão**: SDK `pagseguro-encryption` no browser → gera `encrypted` → `POST /orders` com `charges[].payment_method.card.encrypted`.
- **Híbrido recomendado apenas como contingência**: se a tokenização falhar, oferecer link de pagamento PagBank como fallback — sem virar default.

Decisão a confirmar: usar **`/orders` (Pedidos)** ou **`/charges` (Cobranças diretas)** do PagBank. Recomendo `/orders` para manter paridade conceitual com o modelo atual (1 order FestPag = 1 order PagBank).

---

## 8. Plano de migração por fases

### Fase 0 — Preparação (sem mudar nenhum fluxo)
- Documentar mapa completo de status MP ↔ PagBank ↔ FestPag-normalizado.
- Criar conta sandbox PagBank, capturar credentials.
- Definir `platform_settings.payment_provider` (default `mercadopago`).

### Fase 1 — Refator interno sem trocar provider
- Extrair `_shared/payments/IPaymentProvider.ts` e mover toda lógica MP para `MPProvider`.
- Migrar Edge Functions de domínio para usarem o provider via injeção (sem trocar comportamento).
- Adicionar colunas `payment_provider` e `provider_payment_id` em `orders`; backfill.
- Adicionar coluna `provider` em `mp_webhook_events` (default `mercadopago`).
- **Critério de saída:** todos os fluxos atuais funcionando idênticos, com provider hardcoded em `mercadopago`.

### Fase 2 — Implementar `PagBankProvider` em modo dark
- Implementar `createPix`, `chargeCard`, `fetchPayment`, `verifyWebhook`, `normalizeStatus`.
- Endpoint webhook PagBank em paralelo (`pagbank-webhook`), sem rotear tráfego ainda.
- Testes de integração contra sandbox PagBank.
- **Critério de saída:** suíte de testes verde em sandbox para PIX e cartão.

### Fase 3 — Canary por evento
- Adicionar `events.payment_provider_override` (nullable). Selecionar 1 evento de baixo volume para usar `pagbank`.
- Frontend lê o provider do evento e carrega o SDK correspondente.
- Monitorar webhook + reconcile + check-in por 7 dias.

### Fase 4 — Rollout gradual
- Migrar lotes de eventos por categoria de risco crescente.
- Manter `MPProvider` ativo para pedidos antigos (PIX expira em 30min, então legado some rápido).

### Fase 5 — Cutover total
- `platform_settings.payment_provider = 'pagbank'` como default global.
- MP fica disponível apenas para reconciliar pedidos pré-cutover.

### Fase 6 — Limpeza
- Remover SDK MP do `index.html`.
- Mover `MPProvider` para `_shared/payments/legacy/` (apenas leitura/reconcile).
- Renomear coluna `orders.mp_payment_id` (manter view de compat se necessário).

---

## 9. Testes obrigatórios para a migração

Para cada provider, em sandbox:

1. **PIX feliz**: criar → pagar → webhook → ticket `valid` → `/meus-ingressos` → check-in OK.
2. **PIX expirado**: criar → não pagar → cron expira → inventário liberado → ticket `cancelled`.
3. **PIX pago após expiração local mas antes do gateway expirar** → cron deve recuperar.
4. **Cartão aprovado inline** → ticket `valid` imediato.
5. **Cartão `in_process`** → fica em `awaiting` → webhook promove.
6. **Cartão recusado** → libera reserva, marca `failed`, mensagem amigável.
7. **Webhook duplicado** → dedupe não cria efeito colateral.
8. **Webhook com assinatura inválida** → 401, sem efeito.
9. **Webhook com `external_reference` errado** → audit log, sem promoção.
10. **Webhook com `amount` divergente** → audit log, sem promoção.
11. **Polling de usuário diferente do dono** → não promove (não-autoritativo).
12. **Cupom 100% (final 0,01)** → não quebra reserva nem PIX.
13. **Cupom expirado / esgotado** → ignorado, total cheio.
14. **Cupom usado exatamente 1x** após múltiplas chamadas idempotentes de `apply_order_approved`.
15. **Reembolso** → marca `refunded`, log de revisão manual.
16. **Chargeback** → marca `charged_back`, log de revisão manual.
17. **Inventário em concorrência**: 2 compras simultâneas pelo último ingresso → uma falha limpa.
18. **Pedido em voo durante cutover** (PIX criado no MP, cron precisa continuar revalidando MP).
19. **Check-in de ticket `pending`** → bloqueado.
20. **`/meus-ingressos`** não exibe tickets `pending`.

---

## 10. Parecer final

**Pronto para planejar implementação — sob condição arquitetural.**

A camada está saudável o suficiente para iniciar a migração, mas **não recomendo trocar Mercado Pago por PagBank diretamente nas funções existentes**. O caminho seguro é a Fase 1 antes de tudo: introduzir a camada `IPaymentProvider` e isolar o MP atrás dela. Sem essa abstração, a migração vira um big-bang com risco real de oversell, perda de pedidos e regressão de check-in.

Não identifiquei legado perigoso pendente — o `create-mercadopago-preference` já está neutralizado (410) e o `decrement_sold_quantity_legacy` é claramente uma ferramenta de reconciliação histórica controlada.

---

## TOP 10 pontos acoplados ao provedor atual

1. `process-card-payment` chama `https://api.mercadopago.com/v1/payments` direto.
2. `create-mercadopago-pix` lê `point_of_interaction.transaction_data.qr_code` (formato MP).
3. `mercadopago-webhook` valida HMAC com manifest específico do MP.
4. `check-mercadopago-payment` faz `GET /v1/payments/{id}` e compara `external_reference`.
5. `expire-pending-orders` revalida no MP antes de liberar inventário.
6. `reconcile-orphan-orders` varre `GET /v1/payments` por `mp_payment_id`.
7. `index.html` carrega `sdk.mercadopago.com/js/v2`.
8. `CheckoutStepCard` usa `window.MercadoPago.createCardToken` e `getInstallments`.
9. Schema: `orders.mp_payment_id` + tabela `mp_webhook_events` + secrets `MERCADOPAGO_*`.
10. `CheckoutSuccess.deriveView` e `useEventOrders` carregam o vocabulário de status do MP (`in_process`, `charged_back`).

## TOP 10 riscos da migração

1. Oversell por reserva não atômica no novo fluxo.
2. Pedidos pagos sem promoção (`paid_without_tickets`).
3. Webhook duplicado promovendo pedido 2x.
4. Cupons supercontabilizados.
5. Pedidos em voo durante o cutover.
6. PIX com QR/expiração em formato diferente quebrando UX.
7. Tokenização de cartão falhando no SDK PagBank em browsers específicos.
8. Diferenças de antifraude alterando taxa de aprovação.
9. Assinatura de webhook PagBank validada incorretamente → 401 em massa.
10. `expire-pending-orders` liberando inventário de pedidos que pagaram tarde no PagBank.

## TOP 10 testes mais importantes

1. Promoção `pending → paid` idempotente no webhook PagBank.
2. Reserva atômica sob concorrência (último ingresso).
3. Cupom contabilizado exatamente uma vez após N webhooks.
4. Polling não-autoritativo para usuário diferente do dono.
5. Webhook com `amount` divergente é rejeitado e auditado.
6. Webhook com assinatura inválida retorna 401.
7. PIX expirado libera inventário e cancela tickets.
8. Cartão `in_process` → `paid` via webhook reflete no `/meus-ingressos`.
9. Refund marca pedido sem auto-liberar inventário (revisão manual).
10. Check-in só aceita ticket `valid` dentro da janela.

## TOP 5 decisões arquiteturais antes de construir

1. **Adotar camada `IPaymentProvider`** com adapters MP e PagBank — sim/não. (Recomendo sim.)
2. **Granularidade do toggle**: global (`platform_settings`) vs por evento (`events.payment_provider_override`). (Recomendo ambos, com per-event vencendo.)
3. **PagBank `/orders` vs `/charges`** como endpoint canônico. (Recomendo `/orders`.)
4. **Renomear schema agora** (`orders.mp_payment_id`) ou só na Fase 6 com view de compat. (Recomendo Fase 6.)
5. **Fallback de checkout hospedado PagBank** ativado por default ou só sob feature flag de contingência. (Recomendo só contingência.)
