## Plano Bloco 3 — finalização

### 1. Migration: ampliar `orders.status`

```sql
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending','paid','cancelled','refunded',
    'expired','failed','in_review','charged_back'
  ));
```

Sem alterações em RLS ou dados.

### 2. Ajuste de autenticação do `expire-pending-orders` (opção 1)

Hoje a função está com `verify_jwt = true` no `supabase/config.toml`. Chamar via `pg_net` com apenas `apikey: anon` realmente não autentica (anon não tem JWT de usuário, e a função além disso valida `getClaims()` no header Authorization). Solução escolhida pelo usuário: **opção 1**.

**Mudanças:**

a. `supabase/config.toml`:
```toml
[functions.expire-pending-orders]
verify_jwt = false
```
(reconcile-orphan-orders permanece `verify_jwt = true` — só admin chama manualmente)

b. `supabase/functions/expire-pending-orders/index.ts` — substituir o bloco de auth por validação de header `X-Cron-Secret`:

```typescript
const cronSecret = Deno.env.get('CRON_SECRET');
const provided = req.headers.get('X-Cron-Secret');
if (!cronSecret || provided !== cronSecret) {
  return new Response(JSON.stringify({ error: 'Forbidden' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
```

Remover qualquer dependência de `getClaims()` na função. O resto da lógica (batch, MP double-check, transição atômica, release de lote, cap de 180min) continua igual.

c. **Novo secret runtime:** `CRON_SECRET` (32+ chars aleatórios, gerado no momento de salvar). Vou usar `add_secret` para pedir ao usuário cadastrar antes de redeploy.

### 3. Reconciliação dos órfãos (manual, admin)

Após (1) e (2) aplicados:

- `POST /reconcile-orphan-orders?dry_run=true` → confirmar plano (esperado: 25 candidatos, 11 expired + 14 marked_failed, 0 inventory_corrections — base nos logs reais).
- `POST /reconcile-orphan-orders` → executar.
- Validar via SQL: `select status, count(*) from orders group by status` deve mostrar `expired` e `failed` aparecendo.

### 4. Agendar cron

SQL direto (não migration — contém URL e secret):

```sql
select cron.schedule(
  'expire-pending-orders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/expire-pending-orders',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Cron-Secret', current_setting('app.cron_secret', true)
    ),
    body := jsonb_build_object('source','cron','time', now())
  );
  $$
);
```

Como `pg_cron` não tem acesso direto a env vars do Edge Runtime, o `CRON_SECRET` vai ser materializado como GUC do banco via:

```sql
alter database postgres set app.cron_secret = '<valor>';
```

Alternativa mais simples (que vou adotar caso o `alter database` cause atrito): inline o secret literal no SQL do `cron.schedule` (fica armazenado dentro da definição do job, só admin do banco vê). Decido na hora da execução, sem mudança de plano.

### 5. Verificação final

- `select * from cron.job where jobname='expire-pending-orders-every-minute';`
- Aguardar ~2 min, conferir `cron.job_run_details` (últimos 5 runs) e `edge_function_logs` do `expire-pending-orders` (deve aparecer `[EXPIRE-RUN]` por minuto).
- `select status, count(*) from orders group by status;` final.

## Resumo de mudanças

- 1 migration (CHECK constraint).
- 1 edit em `supabase/config.toml` (`verify_jwt = false` só para expire-pending-orders).
- 1 edit em `supabase/functions/expire-pending-orders/index.ts` (trocar auth por X-Cron-Secret).
- 1 novo secret runtime: `CRON_SECRET`.
- 1 SQL fora-de-migration: `cron.schedule` + (opcional) `alter database … set app.cron_secret`.

## Fora do escopo

- `reconcile-orphan-orders` continua exigindo JWT admin (chamada manual, não automatizada).
- Sem mudanças no frontend.
