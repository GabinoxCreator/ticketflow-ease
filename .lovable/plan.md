# Bloco 5 — Hardening de Segurança (revisado v5)

Plano v4 aprovado integralmente, com **única correção** no helper `formatCheckinWindow`: comparação de "mesmo dia" agora usa data formatada em `America/Sao_Paulo`, não `toDateString()` (que usa timezone do navegador).

Diagnósticos confirmados: 0 duplicados em `guest_list_entries` públicas; 1 produtor com PIN; `checkin_logs.action` sem CHECK constraint.

## 1. RLS de cupons — fechar leitura pública

`DROP POLICY "Cupons ativos visíveis publicamente" ON event_coupons`. Validação pública continua via `validate-coupon` (service role).

## 2. Janela de check-in — helper SQL

```text
public.is_event_checkin_open(_event_id uuid)
  returns table (is_open boolean, reason text, starts_at timestamptz, ends_at timestamptz)
```

Regras (timezone `America/Sao_Paulo`):
- `starts_at = (events.date::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'` (00:00 local).
- `ends_at = ((events.date + events.time)::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '15 hours'`.
- `is_open = now() BETWEEN starts_at AND ends_at`.
- `reason`: `event_not_found` | `before_window` | `after_window` | `null`.
- Não usa `end_date`/`end_time`.

Permissões restritas:
```sql
REVOKE ALL ON FUNCTION public.is_event_checkin_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_checkin_open(uuid) TO service_role;
```

## 3. Edge functions de check-in — atômicas + janela

### `collaborator-validate-ticket`
1. Validar sessão e acesso ao evento.
2. `supabase.rpc('is_event_checkin_open', { _event_id })`.
3. Se `is_open=false` → log `checkin_blocked_window` + retorna `{ ok:false, reason, starts_at, ends_at, message }` (HTTP 200).
4. Update atômico:
   ```ts
   .from('tickets')
   .update({ status: 'used', validated_at: new Date().toISOString() })
   .eq('id', ticket.id).eq('status', 'valid')
   .select().maybeSingle();
   ```
5. Se null → reler ticket → `already_used` ou `invalid_status`.
6. Sucesso → log `action='checkin'`.

### `collaborator-validate-guest-entry`
- Mesma chamada `is_event_checkin_open` + log de bloqueio.
- Update atômico com `.eq('status', 'pending')`. Se null → "convidado já fez check-in".

## 4. Frontend de colaborador — `formatCheckinWindow` (CORRIGIDO)

`src/lib/checkinWindow.ts`:

```ts
export function formatCheckinWindow(starts: Date, ends: Date): string {
  const d = (x: Date) => x.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });
  const t = (x: Date) => x.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
  const sameDay = d(starts) === d(ends);
  return sameDay
    ? `Check-in permitido em ${d(starts)}, das ${t(starts)} às ${t(ends)}.`
    : `Check-in permitido de ${d(starts)} ${t(starts)} até ${d(ends)} ${t(ends)}.`;
}
```

Comparação de mesmo dia usa string formatada em `America/Sao_Paulo` — independe do timezone do navegador.

Exemplos:
- Evento 06/05 08:00 → `"Check-in permitido em 06/05/2026, das 00:00 às 23:00."`
- Evento 06/05 10:00 → `"Check-in permitido de 06/05/2026 00:00 até 07/05/2026 01:00."`
- Evento 06/05 22:00 → `"Check-in permitido de 06/05/2026 00:00 até 07/05/2026 13:00."`

`ColaboradorQRScanner.tsx` e `ColaboradorListaDetalhe.tsx` tratam `reason in ('before_window','after_window')` com toast vermelho usando o helper.

## 5. Rate-limit (ad-hoc com TTL)

Tabela `auth_rate_limits` (`bucket_key pk, attempts, window_start, blocked_until, last_attempt_at`). RLS: select admin; escrita só service role.

Função `check_rate_limit(_bucket text, _max int, _window_seconds int, _block_seconds int) returns (allowed bool, retry_after_seconds int)` via `INSERT … ON CONFLICT DO UPDATE` atômico.

TTL via pg_cron (1h):
```sql
DELETE FROM auth_rate_limits
 WHERE last_attempt_at < now() - interval '24 hours'
   AND (blocked_until IS NULL OR blocked_until < now());
```

Buckets (lowercase):
- `login:user:<lower(username)>` 5/15min, bloqueio 15min.
- `login:ip:<ip>` 20/15min.
- `otp:email:<lower(email)>` 3/15min, bloqueio 30min.
- `otp:ip:<ip>` 10/15min.
- `pin:user:<user_id>` 5/10min, bloqueio 30min.
- `guest:ip:<ip>:<list_id>` 5/10min.

IP via `cf-connecting-ip` → fallback primeiro item de `x-forwarded-for`. Bloqueado: **HTTP 429** + `{ error:'rate_limited', retry_after_seconds }`.

Aplicado em: `collaborator-login`, `send-verification-code`, `send-password-reset-code`, `verify-producer-pin`, `public-guest-list-signup`.

**Ordem em `public-guest-list-signup`:** resolver lista por slug (404 se não existir, sem bucket) → rate-limit com `list.id` → capacidade → insert (com tratamento de `23505` para idempotência).

## 6. PIN do produtor — bcrypt

- `set-producer-pin` e `verify-producer-pin` migram para `bcrypt` (`https://deno.land/x/bcrypt@v0.4.1/mod.ts`).
- `verify-producer-pin`: `$2…` → `bcrypt.compare`; legado SHA-256 → `{ valid:false, needs_reset:true }`.
- `set-producer-pin`: aceita PIN sem `current_pin` quando hash existente é legado.
- Rate-limit aplicado.
- `PinVerificationDialog.tsx`: em `needs_reset:true` muda para "criar novo PIN" sem cobrar PIN atual + toast.

## 7. Idempotência em `public-guest-list-signup`

```sql
CREATE UNIQUE INDEX uniq_guest_entry_per_list_public
  ON guest_list_entries (guest_list_id, lower(trim(name)))
  WHERE added_by = 'public';
```
Erro `23505` na inserção → `{ ok:true, duplicate:true, message:'Você já está nesta lista' }`.

## 8. Audit logs

`audit_logs` apenas com `actor_id = auth.uid()`. Novas: `pin_set`, `pin_reset_forced`. Ações sem ator humano → `console.log` padronizado, sem placeholder UUID.

## 9. Índices SQL

```sql
CREATE INDEX IF NOT EXISTS idx_tickets_event_status     ON tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_lot_status       ON tickets(lot_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_event_status      ON orders(event_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_pending_expires   ON orders(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_checkin_logs_event_created ON checkin_logs(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_webhook_processed     ON mp_webhook_events(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_captured ON system_health_snapshots(captured_at DESC);
```

## 10. Tipos Supabase

Após migration: regenerar `src/integrations/supabase/types.ts` para incluir `auth_rate_limits`, `check_rate_limit` e `is_event_checkin_open`.

## 11. Fora do escopo

Tickets anônimos/claim, notificações pós-pagamento, remoção de `/checkout` legado, captcha externo, cookies httpOnly para colaborador.

## 12. Arquivos previstos

**Migration única:** RLS cupons + `is_event_checkin_open` (REVOKE/GRANT restritos) + `auth_rate_limits` + `check_rate_limit` + unique index guest + 7 índices + pg_cron cleanup.

**Edge functions:** `collaborator-validate-ticket`, `collaborator-validate-guest-entry`, `collaborator-login`, `send-verification-code`, `send-password-reset-code`, `set-producer-pin`, `verify-producer-pin`, `public-guest-list-signup`.

**Frontend:** `ColaboradorQRScanner.tsx`, `ColaboradorListaDetalhe.tsx`, `PinVerificationDialog.tsx`, novo `src/lib/checkinWindow.ts`.

**Tipos:** `src/integrations/supabase/types.ts` regenerado.

## 13. Ordem de execução

1. Migration consolidada.
2. Regenerar `types.ts`.
3. Edge functions de check-in (janela + atomicidade).
4. Rate-limit nos 5 endpoints.
5. Bcrypt do PIN + UI `needs_reset`.
6. Idempotência em guest signup.
7. Checklist manual: 6 logins falhos → 429; QR fora da janela → recusa com mensagem formatada (verificar caso "mesmo dia" e "cruza dia"); segunda inscrição mesmo nome → idempotente; produtor com PIN antigo → reset; consulta anônima a `event_coupons` → vazia; dois scanners simultâneos no mesmo ticket → só um valida.

## 14. Rollback

- Cupons: recriar policy pública.
- Funções/tabelas novas: `DROP` isolado + revert das edge functions.
- Unique index guest: `DROP INDEX`.
- Bcrypt PIN: rollback exige reset manual (N=1).
