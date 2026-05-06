# Bloco 4 — Observabilidade & painel de saúde (revisado)

Ajustes aprovados pelo usuário incorporados: snapshot único por captura com `metrics jsonb`, drift de inventário separado em duas leituras, debounce por tipo de alerta, ações operacionais sob audit + confirmação forte, painel baseado em snapshots persistidos.

## 1. Migration

### 1.1 `system_health_snapshots`
Uma linha por captura. JSON consolidado.

```text
id uuid pk
captured_at timestamptz default now()
metrics jsonb            -- ver shape abaixo
overall_severity text    -- 'ok' | 'warn' | 'crit'
duration_ms int          -- tempo da função para coletar
```

Índices: `(captured_at desc)`, `(overall_severity, captured_at desc)`.

RLS:
- `select` apenas para `has_role(auth.uid(),'admin')`.
- `insert/update/delete` bloqueado para qualquer role (somente service role escreve).

Shape de `metrics`:
```text
{
  orders: {
    pending_count, pending_oldest_age_seconds,
    paid_last_hour, expired_last_hour, failed_last_hour
  },
  webhooks: {
    received_last_hour, ok_last_hour, error_last_hour, duplicate_last_hour,
    last_event_at
  },
  cron: {
    last_run_at, last_status, runs_last_hour, failed_last_hour
  },
  inventory: {
    confirmed_drift_count,   -- lotes em que sold != tickets valid
    reservation_drift_count  -- lotes em que reserved != tickets pending recentes
  }
}
```
Cada bloco contribui com sua severidade local; `overall_severity` é o pior dos blocos.

### 1.2 `health_alert_throttle`
Debounce por tipo de alerta.
```text
id uuid pk
alert_key text unique  -- ex.: 'cron_stalled:crit', 'inventory_confirmed_drift:crit', 'pending_orders_spike:warn'
last_sent_at timestamptz
```
RLS: select admin; escrita só service role.

### 1.3 `audit_logs` (já existe)
Reaproveitar para registrar `manual_expire_run`, `manual_reconcile_dry_run`, `manual_reconcile_apply` com `actor_id = auth.uid()` e `metadata` contendo o resultado retornado.

## 2. Edge function `health-snapshot`

- `verify_jwt = false`, autenticação via header `X-Cron-Secret` (mesmo padrão do Bloco 3, secret `CRON_SECRET` já existe).
- Roda só leituras (service role). Calcula os 4 blocos:
  - **Orders:** counts por status na última hora + idade do `pending` mais antigo.
  - **Webhooks:** agrega `mp_webhook_events` por `outcome` na última hora.
  - **Cron:** consulta `cron.job_run_details` filtrando o jobname do Bloco 3.
  - **Inventory:**
    - `confirmed_drift`: por lote, `sold_quantity` vs `count(tickets where status='valid')`.
    - `reservation_drift`: por lote, `reserved_quantity` vs `count(tickets where status='pending' and order.expires_at > now())`.
- Aplica regras de severidade:
  - `orders.pending_count > 50` → warn; `> 200` ou `pending_oldest_age > 60min` → crit.
  - `cron.last_run_at` ausente nos últimos 5 min → crit.
  - `webhooks.error_last_hour > 5` → warn; `> 20` → crit.
  - `inventory.confirmed_drift_count > 0` → crit.
  - `inventory.reservation_drift_count > 0` → warn (transitório esperado).
- Insere o snapshot.
- Para cada bloco com severidade ≥ warn: gera `alert_key` (ex.: `pending_orders_spike:crit`); se `crit` e `health_alert_throttle.last_sent_at` for `null` ou > 30 min, dispara email via Resend para `gabinox54037@gmail.com` e atualiza throttle.

Cron schedule (SQL fora de migration, contém URL e secret):
```text
health-snapshot-every-minute → POST /functions/v1/health-snapshot
header X-Cron-Secret = current_setting('app.cron_secret', true)
```

## 3. Aba `/admin/saude`

- Item “Saúde” no `AdminSidebar` com ícone `Activity`.
- Página consome **somente** `system_health_snapshots` (a fonte é a tabela; logs são debug).
- Layout:
  - Header com badge do `overall_severity` mais recente (verde/amarelo/vermelho no tema admin).
  - 4 cards de blocos (Orders, Webhooks, Cron, Inventory) lendo do `metrics` mais recente, cada um com sua severidade local e timestamp.
  - Mini-gráfico (sparkline) por bloco com últimas 60 capturas (`pending_count`, `webhooks_error_last_hour`, etc.).
  - Tabela “Alertas recentes”: snapshots `warn`/`crit` das últimas 24h (timestamp, blocos afetados, principais valores).
  - Seção “Ações operacionais” (collapse fechado por default), apenas admin: botões abaixo.

### Ações operacionais (com proteção extra)

Para ambas:
- `AlertDialog` de confirmação com **digitar “CONFIRMAR”** para habilitar o botão final.
- Insere `audit_logs` com `actor_id = auth.uid()`, `target_type = 'system'`, `action = '<nome>'`, `metadata = { result }`.
- Restrito a admin (já garantido pela rota + RLS de `audit_logs`).

Botões:
1. **“Reconciliar órfãos (dry run)”** — chama `reconcile-orphan-orders?dry_run=true`. Mostra o plano retornado. **Sem botão de “aplicar” neste bloco.** A aplicação real continua sendo feita manualmente fora do painel até decidirmos abrir.
2. **“Forçar varredura de expiração”** — chama `expire-pending-orders` autenticado como admin (sem `X-Cron-Secret`; a função aceita admin via JWT como fallback documentado). Audit log obrigatório.

## 4. Padronização de logs (complemento, não fonte)

Pequena varredura nas funções de pagamento (`mercadopago-webhook`, `expire-pending-orders`, `process-card-payment`, `create-mercadopago-pix`, `reconcile-orphan-orders`) para padronizar prefixo (`[MP-WH]`, `[EXPIRE-RUN]`, etc.) e campos (`event`, `order_id`, `mp_payment_id`, `outcome`). Sem mudança de lógica.

## 5. Fora do escopo

- Refunds/estornos.
- Aplicar reconciliação direto pelo painel (só dry run nesta entrega).
- Painel para colaboradores ou produtores (Saúde é exclusivo do admin).
- Mexer em rotas de cliente/produtor.

## 6. Secrets / config

Reaproveita: `CRON_SECRET`, `RESEND_API_KEY`. Nenhum novo secret necessário.

`supabase/config.toml`: bloco da nova função
```toml
[functions.health-snapshot]
verify_jwt = false
```

## 7. Arquivos previstos

Novos:
- `supabase/functions/health-snapshot/index.ts`
- `src/pages/admin/AdminSaude.tsx`
- `src/hooks/useHealthSnapshots.ts`
- 1 migration (tabelas + RLS)

Editados:
- `src/components/admin/AdminSidebar.tsx` (item “Saúde”)
- `src/App.tsx` (rota `/admin/saude`)
- `supabase/config.toml` (bloco da função)
- 5 arquivos de edge functions de pagamento (apenas `console.log` padronizado)

## 8. Ordem de execução

1. Migration (`system_health_snapshots` + `health_alert_throttle` + RLS).
2. Edge function `health-snapshot` + entrada no `config.toml`.
3. Teste manual via `X-Cron-Secret` e verificação dos primeiros snapshots.
4. Agendar `pg_cron` (SQL inline, fora de migration).
5. Construir `/admin/saude` (cards + sparkline + tabela + ações com confirm + audit).
6. Padronização de logs nas 5 funções de pagamento.
7. Validação final (10 min rodando + abrir painel + testar uma ação operacional dry run).
