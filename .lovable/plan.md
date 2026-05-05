# Bloco 3 — Expiração + reconciliação (revisado com seus 5 ajustes)

## Verificações pré-implementação

- `pg_cron` 1.6.4 e `pg_net` 0.19.5 estão **disponíveis** no projeto, ainda não instaladas. `CREATE EXTENSION` resolve. **Não é necessário fallback externo.**
- Cutoff Bloco 1: timestamp da migration `20260505141248` → **`2026-05-05 14:12:48 UTC`** será o limite usado para identificar pedidos pré-Bloco 1.

## Ajustes aplicados ao plano

### Ajuste 1 — Sem delete de tickets

Onde antes era `delete from tickets`, agora:
```ts
await supabase.from('tickets')
  .update({ status: 'cancelled' })   // tickets usam 'cancelled' (constraint atual)
  .eq('order_id', orderId)
  .eq('status', 'pending');
```
Mantém histórico em `tickets` para auditoria. Aplicado em `expire-pending-orders`, `reconcile-orphan-orders` e (corrigido também) no `mercadopago-webhook` e `process-card-payment` para coerência — vou trocar os `delete` existentes por `update status='cancelled'`.

### Ajuste 2 — Limite de extensão do `in_process`

Constantes:
- `MAX_TOTAL_LIFETIME_MIN = 180` (3h desde `created_at`)
- `EXTENSION_MIN = 30`

Lógica:
```ts
const ageMin = (Date.now() - new Date(order.created_at).getTime()) / 60000;
if (mpStatus === 'in_process' || mpStatus === 'pending') {
  if (ageMin >= MAX_TOTAL_LIFETIME_MIN) {
    log('IN_PROCESS_TIMEOUT — manual review', { orderId, ageMin });
    // Não expira automaticamente. Marca em audit_logs e segue.
    await supabase.from('audit_logs').insert({
      actor_id: SYSTEM_USER_ID, action: 'order_in_process_timeout',
      target_type: 'order', target_id: orderId,
      metadata: { ageMin, mp_payment_id: order.mp_payment_id }
    });
    skipped++; continue;
  }
  // Estende, mas só até o teto
  const newExpires = new Date(Math.min(
    Date.now() + EXTENSION_MIN * 60000,
    new Date(order.created_at).getTime() + MAX_TOTAL_LIFETIME_MIN * 60000
  )).toISOString();
  await supabase.from('orders').update({ expires_at: newExpires })
    .eq('id', orderId).eq('status', 'pending');
}
```

`audit_logs.actor_id` é NOT NULL — usa um UUID de sistema fixo (criar constante com o UUID do admin principal já existente: `gabinox54037@gmail.com`).

### Ajuste 3 — Batch controlado + logs estruturados

```ts
const BATCH_SIZE = 50;
const stats = { scanned: 0, recovered: 0, expired: 0, extended: 0, skipped: 0, errors: 0 };

const { data: candidates } = await supabase
  .from('orders')
  .select('id, created_at, expires_at, mp_payment_id, payment_method')
  .eq('status', 'pending')
  .not('expires_at', 'is', null)
  .lt('expires_at', new Date().toISOString())
  .order('expires_at', { ascending: true })
  .limit(BATCH_SIZE);

for (const order of candidates) {
  stats.scanned++;
  try { /* ... incrementa recovered/expired/extended/skipped */ }
  catch (e) { stats.errors++; log('ITEM_ERROR', { orderId: order.id, e: e.message }); }
}

console.log('[EXPIRE-RUN]', JSON.stringify({
  ts: new Date().toISOString(), ...stats
}));
```

### Ajuste 4 — Cutoff explícito para correção de estoque

```ts
const BLOCK1_DEPLOY = '2026-05-05T14:12:48Z';

// Só ajusta sold_quantity se created_at < BLOCK1_DEPLOY E MP confirmou rejected/not_found
if (new Date(order.created_at) < new Date(BLOCK1_DEPLOY) && mpFinalStatus === 'rejected') {
  // Para cada lot/qty do pedido:
  await supabase.rpc('decrement_sold_quantity_legacy', { _lot_id, _qty });
  await supabase.from('audit_logs').insert({
    actor_id: SYSTEM_USER_ID,
    action: 'orphan_inventory_correction',
    target_type: 'order', target_id: order.id,
    metadata: { lot_id, qty, reason: 'pre_block1_orphan_rejected_by_mp' }
  });
}
// Pedidos pós-Bloco 1: NUNCA tocar em sold_quantity (release_lot_quantity já cuida do reserved_quantity).
```

Nova RPC `decrement_sold_quantity_legacy(_lot_id, _qty)` com guarda `WHERE sold_quantity >= _qty` para evitar negativos.

### Ajuste 5 — Validação de pg_cron / pg_net

Já validado acima. **Plano A (oficial)**: `CREATE EXTENSION` + `cron.schedule`. **Plano B (fallback)**: caso o agendamento via `cron.schedule` falhe por permissões em runtime, expor a edge function como `verify_jwt = false` com guarda por `X-Cron-Secret` e te orientar a configurar GitHub Actions / Cloudflare Cron / Better Stack chamando o endpoint a cada 1 min. Implemento o Plano A; só caio no Plano B se o agendamento falhar.

## Arquivos

**Migration (schema):**
- `CREATE EXTENSION pg_cron`, `CREATE EXTENSION pg_net`
- Índices parciais em `orders(expires_at)` e `orders(created_at)` WHERE status='pending'
- Função SQL `decrement_sold_quantity_legacy(uuid, int) RETURNS boolean` SECURITY DEFINER

**Criar:**
- `supabase/functions/expire-pending-orders/index.ts` (verify_jwt = true)
- `supabase/functions/reconcile-orphan-orders/index.ts` (verify_jwt = true, exige admin)

**Editar:**
- `supabase/config.toml`: blocos das duas funções
- `src/hooks/useEventOrders.ts`: adicionar `'expired' | 'charged_back'` ao tipo, agrupar em cancelados
- `src/components/producer/OrderListItem.tsx`: badges para `expired` (cinza) e `charged_back` (laranja)
- `supabase/functions/process-card-payment/index.ts`: trocar `delete tickets` por `update status='cancelled'` na rejeição
- `supabase/functions/mercadopago-webhook/index.ts`: idem no ramo rejected/cancelled

**Insert (pós-deploy, contém URL/anon key específicos):**
- `cron.schedule('expire-pending-orders-every-minute', '* * * * *', net.http_post(...))`

## Ordem de execução

1. Migration (extensões + índices + RPC `decrement_sold_quantity_legacy`)
2. Frontend (`useEventOrders` + `OrderListItem`) — não-quebra
3. Patch nos checkout/webhook trocando `delete` por `update status='cancelled'`
4. `expire-pending-orders` + `reconcile-orphan-orders`
5. `config.toml`
6. Eu chamo `reconcile-orphan-orders?dry_run=true` → te entrego relatório → você aprova execução real
7. Insert do cron schedule

## Checklist manual

1. PIX teste, não pagar, esperar ~31min → `status='expired'`, tickets `cancelled`, `reserved_quantity` voltou.
2. PIX teste pago nos últimos 30s → log `[EXPIRE-RUN] recovered:1`, ordem `paid`.
3. Cartão `in_process` envelhecendo → 1ª, 2ª, 3ª passada do cron estendem; ao bater 3h → `audit_logs` + `skipped`, sem expirar.
4. `select * from cron.job;` → job ativo. `select * from cron.job_run_details order by start_time desc limit 5;` → execuções OK.
5. Reconcile dry_run via curl → revisar JSON antes do real.
6. Após reconcile real: `select * from audit_logs where action='orphan_inventory_correction';` deve listar correções.

## Riscos remanescentes (pós-Bloco 3)

- Pedidos `pending` muito antigos sem `expires_at` que escapam do cron — cobertos pelo reconcile inicial; se aparecerem novos por bug, reconcile pode rodar manualmente.
- `cron.schedule` exige role `cron_admin` — Supabase Cloud normalmente concede ao service role; se falhar, plano B.
- MP indisponível → cron pula no minuto, retoma depois. Sem perda.

Sem novos secrets.
