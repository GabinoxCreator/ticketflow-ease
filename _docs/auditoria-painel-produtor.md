# Auditoria read-only — Painel do Produtor

> **Escopo:** diagnóstico apenas (financeiro, cupom, aba Pedidos, cascata de cancelamento).
> **Evento em produção:** `a8ceede6-37d8-4be4-8a60-f4539024f747` · **Supabase:** `nsrromaqysgoxqvqagdm`
> Nada foi alterado — sem edição de código, commit, migration ou escrita no banco.

---

## 0. Conclusão executiva

| Sintoma | Causa raiz encontrada |
|---|---|
| Números do financeiro não batem | **Três fontes de cálculo paralelas**, sem util compartilhado, com filtros/bases diferentes: bruto vs líquido, cortesia incluída em uma e excluída nas outras, taxa MP estimada por % hardcoded. |
| Cupom "não aparece" no pedido | O vínculo **É gravado** (`orders.coupon_id` + `discount_amount`) nos checkouts online e na venda manual — mas a **UI de Pedidos nunca exibe** esses campos. Portaria e fluxos de assento não gravam cupom. |
| Aba Pedidos | Lista estática (sem drawer/detalhe). Único botão de ação: "Cancelar" **só para venda manual paga**. |
| Cancelados sobrando | **Gap principal:** `paid → refunded/charged_back` (online) **não** devolve estoque nem cancela tickets. Só a venda **manual** tem cascata paid→cancelado completa. |

---

## 1. Financeiro — de onde vem cada número

**Não existe hook/util financeiro único.** Há **três fontes de verdade independentes** que recalculam por conta própria — é a raiz das divergências:

1. `src/hooks/useEventOrders.ts` → `src/hooks/useEventStats.ts` — alimenta o **header** e a **Visão Geral**.
2. Query interna de `src/components/producer/tabs/EventFinanceiroTab.tsx` — alimenta a **aba Financeiro**.
3. `src/hooks/useProducerFinance.ts` — alimenta `/produtor/financeiro/:eventId` e a lista `/produtor/financeiro`.

> A taxa de runtime (`src/hooks/useEventFees.ts` `computeFee` + `event_fee_overrides`) **só roda no checkout** (`CheckoutModal.tsx`, `CheckoutStepPayment.tsx`) — **nunca nos dashboards**. Em todo dashboard a taxa da plataforma vem de `orders.service_fee_amount` já gravado.

| Número | arquivo:linha | (a) status que entram | (b) bruto/líquido | (c) origem da taxa | (d) manual? |
|---|---|---|---|---|---|
| **Receita Total** (header + Visão Geral) | `EventDashboardHeader.tsx:171-173`, `EventOverviewTab.tsx:53-54`; cálc. em `useEventOrders.ts:83` (via `useEventStats.ts:80`) | `paid` + `completed` (`useEventOrders.ts:77`) | **líquido** `total_amount − service_fee_amount` | `service_fee_amount` gravado | inclui `manual`. **NÃO exclui `courtesy`** ⚠️ |
| **Vendas Totais / Valor Arrecadado** (Financeiro) | `EventFinanceiroTab.tsx:199` e `:236` → `grossTotal` (`:107,:111,:115`) | `paid` + `completed` (`:62`) | **bruto** `total_amount` (com taxa) | — | exclui `courtesy` (`:99`), inclui `manual`; portaria fora |
| **Repasse ao Produtor** (Financeiro) | `EventFinanceiroTab.tsx:210` → `:117` (`grossTotal − platformFee`) | `paid` + `completed` | efetivo `total_amount − service_fee_amount` | `service_fee_amount` gravado | exclui courtesy, inclui manual |
| **Total Bruto Online** (Financeiro) | `EventFinanceiroTab.tsx:317` → `grossOnline` (`:107`; `null` tratado como online `:103`) | `paid` + `completed` | **bruto** `total_amount` | — | **só online** (exclui manual e courtesy) |
| **Taxa Bruta Cobrada** (Financeiro) | `EventFinanceiroTab.tsx:353` → `platformFee` (`:116`) | `paid` + `completed` | soma de `service_fee_amount` | gravado | online + manual (exclui courtesy) |
| **Lucro Líquido (Plataforma)** (Financeiro) | `EventFinanceiroTab.tsx:219` e `:367` → `:138` (`platformFee − totalMpFee`) | `paid` + `completed` | — | **taxa MP ESTIMADA em runtime** `MP_FEE_PIX_PERCENT=0.99%` / `MP_FEE_CARD_PERCENT=4.98%` (`:16-17`, aplicada `:133-135`) — **não vem do banco** | só online (`:132`), exclui courtesy |

### Divergências que explicam os números que não fecham
1. **Bruto vs líquido no mesmo conceito.** "Receita Total" (header) é **líquida** (`useEventOrders.ts:83` subtrai a taxa); "Vendas Totais"/"Valor Arrecadado" (Financeiro) é **bruta** (`total_amount`). Nomes parecidos, bases diferentes — por design.
2. **Cortesia.** `useEventOrders.ts` (header/overview) **não exclui** `sale_origin='courtesy'`; `EventFinanceiroTab.tsx:99` e `useProducerFinance.ts:120` **excluem**. Se houver cortesia com `total_amount > 0`, o header infla vs as telas financeiras.
3. **Três somatórios independentes** com o mesmo filtro de status mas números distintos; só `useProducerFinance.ts` aplica `Math.max(0,…)` (`:157,168,171,174`) → centavos/valores diferentes entre `/eventos/:id` e `/financeiro/:eventId`.
4. **Quarta base ainda diferente:** `useEventStats.ts:34-39` (`salesByLot.revenue`) rateia `total_amount−fee` por nº de tickets `valid/used` — base em **tickets**, não em orders; pode não fechar com os cards.
5. **Taxa MP é estimativa hardcoded** (`EventFinanceiroTab.tsx:16-17`); "Lucro Líquido" e "Valor Líquido Online" dependem dela e **não têm contrapartida real** do Mercado Pago no banco.

> Os valores citados no pedido (50.540 / 49.653 / 49.140 / 45.263 / 513 / −160,26) são coerentes com esse desenho: receita líquida vs bruta ≈ diferença da taxa; −160,26 = taxa da plataforma menor que a taxa MP estimada.

---

## 2. Cupom — o vínculo está sendo gravado?

**SIM, é persistido no pedido** (contraria a hipótese de que só o `uses_count` era incrementado). Schema confirmado: `orders.coupon_id` (`types.ts:1207`) e `orders.discount_amount` (`types.ts:1213`); origem `migrations/20260429180032_…sql:69-70` (`coupon_id uuid REFERENCES event_coupons(id) ON DELETE SET NULL`, `discount_amount numeric DEFAULT 0`).

- `validate-coupon/index.ts:60,91` retorna `couponId = event_coupons.id`.
- **Grava `coupon_id` + `discount_amount` no INSERT:**
  - `process-card-payment/index.ts:200,202`
  - `create-mercadopago-pix/index.ts:204,206`
  - `producer-create-manual-sale/index.ts:241,242` (`sale_origin='manual'`)
- **Desconto abate de `total_amount`** (não é campo à parte solto): `total_amount` gravado já líquido — `process-card-payment/index.ts:187,199`; `create-mercadopago-pix/index.ts:191,203`; `producer-create-manual-sale/index.ts:227,239`. `discount_amount` é redundante/informativo.
- **`apply_order_approved` NÃO grava vínculo** — só **lê** `coupon_id` do pedido e incrementa `event_coupons.uses_count` (`migrations/20260528195906_…sql:45,110-113`). Cancelamento reverte (`20260525151902_…sql:145-149`).

**Não grava cupom:** `charge-seat-card` e `create-seat-pix` (sem qualquer ref. a coupon/discount); portaria do colaborador `collaborator-register-door-sale/index.ts:76-89` insere em `door_sales` (tabela separada), sem cupom.

**A aba Pedidos busca mas não exibe:** `useEventOrders.ts:48-52` usa `select('*')` (então `coupon_id`/`discount_amount` vêm no payload), mas a interface `Order` (`useEventOrders.ts:14-36`) **não declara** esses campos e nem `EventOrdersTab.tsx` nem `OrderCard.tsx`/`OrderListItem.tsx` os referenciam (nem no CSV). `EventFinanceiroTab.tsx` também nunca usa `discount_amount`. → **O cupom "não aparece" porque a UI nunca renderiza o campo, não porque falta o dado.**

---

## 3. Pedidos — estado atual (detalhe + cancelar)

**Componente:** `EventDashboard.tsx:142` → `src/components/producer/tabs/EventOrdersTab.tsx:24`. Tem cards de resumo, busca (nome/email/telefone), export CSV e sub-abas Todos/Pagos/Pendentes/Cancelados (`:145-201`); cada item = `OrderListItem` (`:165,173,190,198`).

- **Linha estática.** `OrderListItem.tsx:25` — só texto (nome, badges status/Manual/Cortesia/Revisar, contato, data, valor, método). **Sem Drawer/Dialog/Sheet/detalhe expandível; sem `onClick` de expansão.**
- **Única ação:** botão "Cancelar" que só aparece para **venda manual paga** — `canCancel = isManual && (paid||completed)` (`OrderListItem.tsx:29`, botão `:142-152`), abre `CancelManualSaleDialog` (`:153-159`).
- **Query da lista:** `useEventOrders.ts:48-52` `SELECT * FROM orders WHERE event_id=… ORDER BY created_at DESC` (sem join com tickets/lots). Mutação de status pelo client está **desabilitada por design** — `updateOrderStatus` sempre lança (`useEventOrders.ts:65-75`).

**Cancelar pedido PAGO — o que existe hoje:**
- `producer-cancel-manual-sale/index.ts` (JWT do produtor) → RPC `cancel_manual_order` com service-role. Definição em `migrations/20260525151902_…sql:71-159`:
  - trava order `FOR UPDATE`; exige produtor dono (`:98-103`, senão `forbidden`); **recusa se `sale_origin<>'manual'`** (`:105-107`); idempotente se já cancelada; `invalid_status` se não-`paid`; aborta se algum ticket `used` (`:117-122`);
  - **devolve estoque** `sold_quantity` (`:124-134`); **tickets `valid/pending → cancelled`** (`:136-139`); **order → `cancelled`** (não `refunded`, `:141-143`); reverte `uses_count` do cupom (`:145-150`); audita `manual_sale_cancelled`.
- **Não existe** equivalente para pedido pago **online** (sem refund automatizado no MP). `refunded`/`charged_back` só aparecem como status possíveis e aviso "reembolsar manual no painel do MP" (`EventOrdersTab.tsx:78`, `OrderListItem.tsx:85,89`).
- `expire-pending-orders` **só mexe em `pending`** (`index.ts:146-153`); a `applyExpired` (`:36-70`) expira pendente, libera assentos, `release_lot_quantity`, tickets→`cancelled`. Nunca cancela pago.

---

## 4. Cancelados sobrando — cascata pedido → tickets → estoque

Modelo (`event_lots`): `reserved_quantity` (pending) e `sold_quantity` (confirmado). RPCs `migrations/20260505141248_…sql`: `reserve_lot_quantity:26` (+reserved), `release_lot_quantity:45` (−reserved), `confirm_lot_sale:60` (reserved→sold). Ticket só aceita `pending|valid|used|cancelled` (**não há `expired`** — `20260305135133_…sql:2`).

**Cascata que ACONTECE (correta):**
| Caminho | Onde | Devolve estoque | Tickets |
|---|---|---|---|
| pending → expired (cron) | `expire-pending-orders/index.ts:42,65,67` | `release_lot_quantity` (reserved) | → cancelled |
| pending → failed (webhook rejeitado) | `mercadopago-webhook/index.ts:228,251/260,265` | release seats/lote (reserved) | → cancelled |
| falhas síncronas de cobrança (pending) | `process-card-payment:355/360/385`, `create-seat-pix:370`, `charge-seat-card:292`, `create-mercadopago-pix:366`, `producer-create-manual-sale:360`, `collaborator-reserve-order:132` etc. | release (reserved) | → cancelled |
| **paid → cancelled (SÓ manual)** | `cancel_manual_order` `20260525151902_…sql:131-143` | decrementa `sold_quantity` | → cancelled |
| reconciliador de órfãos | `reconcile-orphan-orders/index.ts:215,253` | release / `decrement_sold_quantity_legacy` | cancela |

**Onde a cascata NÃO acontece (gaps):**

- **🔴 GAP PRINCIPAL — `paid → refunded` / `charged_back` (online) não devolve estoque nem cancela tickets.**
  `mercadopago-webhook/index.ts:269-290`: só faz `UPDATE orders SET status='refunded'|'charged_back'` (`:273`) + `console.log('manual_inventory_review')` (`:287`). **Não** decrementa `sold_quantity`, **não** chama `release_seats_for_order`, **não** seta `tickets.status='cancelled'`.
  → Pedido pago online estornado mantém `sold_quantity` inflado, assentos como `sold` e **tickets `valid` ainda validáveis na portaria**. Devolução deixada explicitamente para "revisão manual". **É a fonte mais provável dos "cancelados sobrando" com estoque/tickets órfãos.**

- **🟠 GAP SECUNDÁRIO — sem caminho automatizado para cancelar pedido pago ONLINE.** `cancel_manual_order` (a única RPC que faz paid→cancelado com devolução de `sold_quantity`) está travada em `sale_origin='manual'` (`20260525151902_…sql:105`). Não há função equivalente para `online`.

- **Menores:** ticket de pedido expirado fica `cancelled` (não `expired`, por constraint) — consistente, mas note na leitura. `confirm_lot_sale` falho em `apply_order_approved` só audita `apply_order_approved_inventory_partial` (`20260528195906_…sql:99-103`) sem reverter — outro ponto possível de drift de `sold_quantity`, fora do escopo de cancelamento.

---

## 5. Queries SELECT prontas (rodar no SQL Editor — NÃO executadas aqui)

Todas para o evento `a8ceede6-37d8-4be4-8a60-f4539024f747`.

```sql
-- 5.1 Orders por status: contagem + somatórios
SELECT
  status,
  sale_origin,
  count(*)                              AS pedidos,
  sum(total_amount)                     AS soma_total_amount,
  sum(service_fee_amount)               AS soma_service_fee,
  sum(discount_amount)                  AS soma_discount,
  sum(total_amount - service_fee_amount) AS soma_liquido
FROM orders
WHERE event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
GROUP BY ROLLUP (status, sale_origin)
ORDER BY status NULLS LAST, sale_origin NULLS LAST;
```

```sql
-- 5.2 Cupom: uses_count declarado vs pedidos que realmente carregam o coupon_id (status paid)
-- Compara contagem/soma real de descontos com o contador do cupom.
SELECT
  c.id                                  AS coupon_id,
  c.code,
  c.discount_type,
  c.discount_value,
  c.uses_count                          AS uses_count_declarado,
  count(o.id) FILTER (WHERE o.status IN ('paid','completed'))          AS pedidos_pagos_com_cupom,
  sum(o.discount_amount) FILTER (WHERE o.status IN ('paid','completed')) AS soma_desconto_pago,
  count(o.id)                           AS pedidos_qualquer_status
FROM event_coupons c
LEFT JOIN orders o
  ON o.coupon_id = c.id
 AND o.event_id  = c.event_id
WHERE c.event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
  AND c.uses_count > 0
GROUP BY c.id, c.code, c.discount_type, c.discount_value, c.uses_count
ORDER BY c.uses_count DESC;
```

```sql
-- 5.3 Tickets por status: contagem
SELECT status, count(*) AS qtd
FROM tickets
WHERE event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
GROUP BY status
ORDER BY status;
```

```sql
-- 5.4 Órfãos: tickets ainda valid/pending cujo pedido NÃO está ativo
-- (o coração do "cancelados sobrando" — tickets validáveis presos a pedido morto)
SELECT
  o.status                              AS order_status,
  t.status                              AS ticket_status,
  count(*)                              AS qtd
FROM tickets t
JOIN orders o ON o.id = t.order_id
WHERE t.event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
  AND t.status IN ('valid','pending')
  AND o.status IN ('cancelled','expired','refunded','failed','charged_back')
GROUP BY o.status, t.status
ORDER BY qtd DESC;
```

```sql
-- 5.5 Drift de estoque: contadores do lote vs contagem real de tickets ativos
-- valid  deveria bater com sold_quantity; pending com reserved_quantity.
SELECT
  l.id                                  AS lot_id,
  l.name,
  l.total_quantity,
  l.sold_quantity                       AS sold_declarado,
  count(t.id) FILTER (WHERE t.status = 'valid')   AS tickets_valid_real,
  l.sold_quantity - count(t.id) FILTER (WHERE t.status = 'valid') AS drift_sold,
  l.reserved_quantity                   AS reserved_declarado,
  count(t.id) FILTER (WHERE t.status = 'pending') AS tickets_pending_real,
  l.reserved_quantity - count(t.id) FILTER (WHERE t.status = 'pending') AS drift_reserved
FROM event_lots l
LEFT JOIN tickets t
  ON t.lot_id = l.id
 AND t.event_id = l.event_id
WHERE l.event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
GROUP BY l.id, l.name, l.total_quantity, l.sold_quantity, l.reserved_quantity
ORDER BY abs(l.sold_quantity - count(t.id) FILTER (WHERE t.status = 'valid')) DESC;
```

> Interpretação esperada: se 5.4 retornar linhas com `order_status IN ('refunded','charged_back')` e `ticket_status='valid'`, é o GAP principal da seção 4 materializado. Se 5.5 mostrar `drift_sold > 0`, o `sold_quantity` está inflado — provável estorno online sem devolução, ou `cancel_manual_order` nunca chamado.
