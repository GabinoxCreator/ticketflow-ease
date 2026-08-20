# Drift de 1 em `sold_quantity` — lote "Convite Solidário" (Confra)

**Data:** 30/07/2026 · **Repo:** site-festpag (`ticketflow-ease`) · **Supabase:** `nsrromaqysgoxqvqagdm`
**Evento:** Confra `e86df07b-e06f-471e-abf0-a5ec94a11b93`
**Status:** investigação READ-ONLY. Nada editado, nada commitado, nenhum SQL executado.

---

## CONCLUSÃO — SIM, com uma ressalva importante

**O número verdadeiro de ingressos que geram repasse é 247** (`paid` + `valid`). O `sold_quantity = 248` está inflado em exatamente 1 unidade pelo pedido `charged_back`, cujo ticket saiu de `valid` **sem** que o estoque vendido fosse devolvido.

A aritmética fecha exata: `confirm_lot_sale` só incrementa na aprovação, e o único decremento existente para pedido pago é o das RPCs de cancelamento. Somando os aprovados que passaram por `sold_quantity` — 247 válidos + 1 do chargeback — chega-se a **248**, com os 69 `expired` e 40 `failed` nunca tendo entrado em `sold` (eles vivem em `reserved_quantity` e são devolvidos por `release_lot_quantity`), e os 3 `cancelled` tendo saído com decremento (via `cancel_manual_order`) ou nunca entrado (se cancelados ainda em `pending`). Em qualquer um desses dois cenários, o total é 248.

**A ressalva (achado novo, refuta parte da hipótese):** o webhook **não cancela tickets** no caminho `charged_back`. Ele só troca o status do pedido e loga `action_required: 'manual_inventory_review'` ([mercadopago-webhook/index.ts:269-289](site-festpag/supabase/functions/mercadopago-webhook/index.ts#L269-L289)). Então o ticket desse pedido estar `cancelled` **não** foi obra do webhook — houve **intervenção manual** (SQL direto, ou chamada manual da RPC). A hipótese de que "o chargeback cancelou o ticket mas não decrementou `sold_quantity`" está **meio certa**: o não-decremento é real e é o gap; mas o cancelamento do ticket veio de fora do código. Isso não muda o número (247), muda o *quem* — e abre uma pergunta que só o `audit_logs` responde (SELECT nº 4).

---

## 1) Estado atual do lote

Não executei. SELECT nº 1 abaixo.

## 2) Reconciliação — onde o drift pode e não pode nascer

`sold_quantity` tem **quatro** escritores no código. Só um deles incrementa no fluxo online:

| Ponto | Efeito | arquivo:linha |
|---|---|---|
| `confirm_lot_sale` | `reserved −qty`, `sold +qty` — **único incremento do fluxo online**, na aprovação | [20260505141248…sql:60-76](site-festpag/supabase/migrations/20260505141248_cc6d2dd2-eba5-4d87-8f2d-9611664303e2.sql#L60-L76) |
| `cancel_manual_order` | `sold −qty` (tickets `valid`) | [20260525151902…sql:132](site-festpag/supabase/migrations/20260525151902_7ea0398b-23b0-4629-b59e-7582bc444587.sql#L132) |
| `cancel_paid_order` | `sold −qty` (`valid`) e `reserved −qty` (`pending`) | [20260721120000…sql:84](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L84) e [100](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L100) |
| `decrement_sold_quantity_legacy` | `sold −qty`, só correção de órfãos pré-Bloco 1 | [20260505153129…sql:15-31](site-festpag/supabase/migrations/20260505153129_96f152db-c7b0-4f94-95f7-0058f1a5c322.sql#L15-L31) |

**`release_lot_quantity` NÃO toca `sold_quantity`** — mexe só em `reserved_quantity` ([20260505141248…sql:45-57](site-festpag/supabase/migrations/20260505141248_cc6d2dd2-eba5-4d87-8f2d-9611664303e2.sql#L45-L57)). É por isso que expirado e falhado não sujam o contador de vendidos: eles saem da reserva, não da venda.

**Um quinto escritor, fora do fluxo de pedidos — vale descartar:** o trigger `on_door_sale_insert` incrementa `sold_quantity` a cada `INSERT` em `door_sales`, **sem criar ticket algum** ([20260409200406…sql:89-108](site-festpag/supabase/migrations/20260409200406_1fbdfdbf-ec36-480c-9e6a-d41663843b19.sql#L89-L108)):

```sql
UPDATE public.event_lots
SET sold_quantity = sold_quantity + NEW.quantity
WHERE id = NEW.lot_id;
```

Uma venda de portaria de 1 unidade nesse lote produziria **exatamente o mesmo sintoma** (+1 em `sold_quantity`, 0 tickets). É a hipótese concorrente, e ela precisa ser descartada com dado — SELECT nº 5. Ela é *menos* provável, porque exigiria que o chargeback tivesse sido decrementado (e nenhum código faz isso), mas as duas somadas se compensariam de forma enganosa, então não dá para pular a checagem.

## 3) O pedido `charged_back`

SELECT nº 3 identifica id, `created_at`, `total_amount`, `payment_method` e o status do ticket. O que o código garante: se ele passou por `apply_order_approved`, o `confirm_lot_sale` incrementou `sold_quantity` ([20260528195906…sql:93](site-festpag/supabase/migrations/20260528195906_fc5adb1f-ce7d-421d-96e9-1cedf35b3b82.sql#L93)) e **nada** o decrementou depois.

## 4) O caminho `paid → charged_back/refunded` NÃO decrementa — confirmado

[mercadopago-webhook/index.ts:269-289](site-festpag/supabase/functions/mercadopago-webhook/index.ts#L269-L289):

```ts
} else if (mpStatus === 'refunded' || mpStatus === 'charged_back') {
  const newStatus = mpStatus === 'refunded' ? 'refunded' : 'charged_back';
  const { data: changed } = await supabase
    .from('orders')
    .update({ status: newStatus, mp_payment_id: paymentId })
    .eq('id', order.id)
    .eq('status', 'paid')
    .select('id, total_amount, customer_email, event_id')
    .maybeSingle();

  if (changed) {
    console.log('[MP-WEBHOOK]', JSON.stringify({ …, action_required: 'manual_inventory_review' }));
    outcome = 'applied';
```

E é só isso. **Sem `release_lot_quantity`, sem `decrement_sold_quantity_legacy`, sem `UPDATE tickets`, sem `cancel_paid_order`.** Contraste com o ramo `rejected` logo acima ([linhas 237-267](site-festpag/supabase/functions/mercadopago-webhook/index.ts#L237-L267)), que faz a cascata completa (libera lote/assento + cancela tickets) — mas só para pedido `pending`.

Também descartei os reconciliadores como autores do cancelamento: **todos** os caminhos de `reconcile-orphan-orders` que cancelam ticket são gatilhados por `.eq('status','pending')` ([linhas 215-217](site-festpag/supabase/functions/reconcile-orphan-orders/index.ts#L215-L217) e [253-255](site-festpag/supabase/functions/reconcile-orphan-orders/index.ts#L253-L255)), assim como `expire-pending-orders` ([linha 67](site-festpag/supabase/functions/expire-pending-orders/index.ts#L67)). Nenhum toca ticket de pedido pago. Daí a conclusão de que o `cancelled` desse ticket é manual.

Detalhe que impede rastrear por timestamp: **`tickets` não tem `updated_at`** ([types.ts:1866-1884](site-festpag/src/integrations/supabase/types.ts#L1866-L1884)) — só `created_at` e `validated_at`. A única trilha do cancelamento é o `audit_logs`.

## 5) `cancel_paid_order` é a correção do gap — e não rodou aqui

**É a correção certa:** decrementa `sold_quantity` para tickets `valid` ([linhas 75-86](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L75-L86)) e `reserved_quantity` para `pending` ([91-102](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L91-L102)), cancela os tickets ([106-109](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L106-L109)), transiciona o pedido sem deletar ([112-114](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L112-L114)) e reverte o cupom ([117-122](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L117-L122)). O próprio comentário nomeia o gap que fecha ([linhas 10-12](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L10-L12)): *"hoje paid → refunded/charged_back só troca status e loga 'manual_inventory_review', deixando sold_quantity inflado e tickets 'valid'"*.

**E o gancho segue comentado** — [mercadopago-webhook/index.ts:291-311](site-festpag/supabase/functions/mercadopago-webhook/index.ts#L291-L311):

```ts
// ATIVAR SÓ APÓS EVENTO 25/07 — validar em homolog primeiro.
// const { error: cascadeErr } = await supabase.rpc('cancel_paid_order', {
//   _order_id: order.id, _target_status: newStatus, _reason: `mp_${mpStatus}:${paymentId}`,
// });
```

Confirmado, portanto: **o chargeback dessa Confra passou sem a cascata.** Duas notas de precisão:

- **Aplicar a migration, por si só, não muda nada em runtime.** As instruções na própria edge ([linhas 296-300](site-festpag/supabase/functions/mercadopago-webhook/index.ts#L296-L300)) exigem três passos: aplicar a migration, **trocar o `.update({ status: newStatus })` por um SELECT do pedido ainda `paid`** (porque é a RPC que faz a transição) e forçar o redeploy da função. Sem o passo 2, descomentar o bloco faria a RPC receber um pedido já em estado terminal.
- **Divergência de registro a resolver:** o cabeçalho do arquivo diz *"⚠️ PREPARADO, NÃO ATIVADO... NÃO deve ser aplicada durante o evento"* ([linhas 4-8](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L4-L8)). Você me informou que **já foi aplicada hoje** — o que é coerente com o evento ter sido 25/07 e hoje ser 30/07, e eu não tenho como verificar estado de banco sem executar SQL. O SELECT nº 6 confirma em uma linha. Se estiver aplicada, o comentário do arquivo ficou desatualizado.
- **Esta RPC não conserta o pedido em questão.** O pedido já está em `charged_back`: chamada com `_target_status='charged_back'` cai na guarda de idempotência e **não muta nada** ([linhas 53-55](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L53-L55)); com qualquer outro alvo, cai em `invalid_status` ([59-61](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L59-L61)). O drift já materializado precisará de correção própria — fora do escopo deste relatório, como pedido.

---

## SELECTs de leitura — prontos, **não executados**

> Read-only, projeto `nsrromaqysgoxqvqagdm`. Nenhum faz `UPDATE`.

### 1. Estado do lote

```sql
select id, name, price, total_quantity, sold_quantity, reserved_quantity,
       is_active, manually_sold_out, created_at, updated_at,
       total_quantity - sold_quantity - reserved_quantity as disponivel
from event_lots
where event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
  and name ilike '%Convite Solid%';
```

### 2. Reconciliação: declarado vs contado (o drift exato)

```sql
with lote as (
  select id, name, total_quantity, sold_quantity, reserved_quantity
  from event_lots
  where event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
    and name ilike '%Convite Solid%'
),
cont as (
  select t.lot_id,
         count(*) filter (where t.status = 'valid')                          as tickets_valid,
         count(*) filter (where t.status = 'used')                           as tickets_used,
         count(*) filter (where t.status = 'pending')                        as tickets_pending,
         count(*) filter (where t.status = 'cancelled')                      as tickets_cancelled,
         count(*) filter (where t.status in ('valid','used')
                            and o.status in ('paid','completed'))            as valid_com_pedido_pago,
         count(*)                                                           as tickets_total
  from tickets t
  join orders o on o.id = t.order_id
  where t.lot_id in (select id from lote)
  group by t.lot_id
)
select l.name,
       l.total_quantity,
       l.sold_quantity                                          as sold_declarado,
       c.tickets_valid + c.tickets_used                          as sold_contado,
       l.sold_quantity - (c.tickets_valid + c.tickets_used)      as drift_sold,
       c.valid_com_pedido_pago                                   as base_repasse_real,
       l.reserved_quantity                                       as reserved_declarado,
       c.tickets_pending                                         as reserved_contado,
       l.reserved_quantity - c.tickets_pending                   as drift_reserved,
       c.tickets_cancelled, c.tickets_total
from lote l
left join cont c on c.lot_id = l.id;
```

Esperado: `drift_sold = 1`, `base_repasse_real = 247`, `drift_reserved = 0`.

### 3. O pedido `charged_back` e o ticket dele

```sql
select o.id            as order_id,
       o.status        as order_status,
       o.created_at,
       o.updated_at,
       o.total_amount,
       o.service_fee_amount,
       o.payment_method,
       o.sale_origin,
       o.mp_payment_id,
       o.mp_status_detail,
       t.id            as ticket_id,
       t.status        as ticket_status,
       t.ticket_code,
       t.created_at    as ticket_created_at,
       t.validated_at,
       l.name          as lote
from orders o
join tickets t   on t.order_id = o.id
join event_lots l on l.id = t.lot_id
where o.event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
  and o.status = 'charged_back'
order by o.created_at;
```

Confirma id/valor/método e que `ticket_status = 'cancelled'`. Se `validated_at` não for nulo, o ingresso **foi usado na portaria antes do chargeback** — muda a conversa (não é só contábil).

### 4. Trilha de auditoria — quem cancelou o ticket, e se a RPC rodou

```sql
select created_at, actor_id, action, target_type, target_id, metadata
from audit_logs
where target_id in (
        select id from orders
        where event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
          and status in ('charged_back','refunded','cancelled')
      )
   or action in ('paid_order_cancelled','orphan_inventory_correction','manual_inventory_review')
order by created_at desc
limit 100;
```

**Como ler:** se aparecer `paid_order_cancelled` para o pedido do chargeback, a RPC **foi** chamada manualmente — e então o não-decremento tem outra causa: o ticket já estava `cancelled` quando ela rodou, o loop de `valid` ([linhas 75-86](site-festpag/supabase/migrations/20260721120000_cancel_paid_order.sql#L75-L86)) encontrou 0 linhas e `sold_quantity` ficou intocado. Se **não** aparecer, o cancelamento do ticket foi `UPDATE` manual puro. Nos dois casos o número de repasse continua 247 — muda só a explicação de como o drift se formou.

### 5. Descartar a hipótese concorrente (venda de portaria)

```sql
select d.id, d.created_at, d.quantity, d.total_amount, d.payment_method,
       d.operator_id, l.name as lote
from door_sales d
join event_lots l on l.id = d.lot_id
where d.event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
order by d.created_at;
```

Se houver **qualquer** `door_sale` no Convite Solidário, o trigger `on_door_sale_insert` já inflou `sold_quantity` sem criar ticket, e o drift de 1 passa a ter duas causas candidatas somando/compensando — **pare e me chame antes de concluir o número**. Se vier vazio para esse lote, a explicação do chargeback fica isolada e a conclusão 247 está fechada.

### 6. Confirmar se `cancel_paid_order` existe no banco

```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef                               as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('cancel_paid_order','cancel_manual_order',
                    'confirm_lot_sale','release_lot_quantity',
                    'decrement_sold_quantity_legacy');
```

Uma linha para `cancel_paid_order` = migration aplicada. Ausência = ainda não aplicada, e o comentário do arquivo está correto.

---

## Resumo executivo

- **Base de repasse: 247 ingressos.** 247 × 370 = **R$ 91.390,00** de valor de face nesse lote (lembrando o achado do relatório anterior: o `total_amount` de cartão parcelado carrega juro que **não** é do produtor).
- **`sold_quantity = 248` está inflado em 1** pelo pedido `charged_back` que nunca devolveu estoque vendido. `confirm_lot_sale` incrementou, e o caminho `paid → charged_back` não tem decremento — confirmado em [mercadopago-webhook/index.ts:269-289](site-festpag/supabase/functions/mercadopago-webhook/index.ts#L269-L289).
- **A hipótese está confirmada no essencial e corrigida num detalhe:** o webhook não cancelou o ticket (ele não faz isso) — o `cancelled` veio de intervenção manual. O gap do não-decremento é real e é o do webhook.
- **`cancel_paid_order` é a correção do gap para o futuro**, mas o gancho continua comentado e exige mais que descomentar; e ela **não** repara este pedido, que já está em estado terminal.
- **Um SELECT é bloqueante para fechar o número:** o nº 5 (`door_sales`). Enquanto ele não vier vazio para o Convite Solidário, existe uma segunda causa possível para o mesmo +1.

Nenhuma correção proposta, conforme pedido.
