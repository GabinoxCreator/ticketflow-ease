# Fase 1 — Preparar `payouts` para fluxo de saque

## Investigação (resultado real)

- `payouts.status` é **`text`**, `NOT NULL`, `DEFAULT 'pending'::text`.
- **Não existe `CHECK`** algum em `payouts` (só PK e 2 FKs).
- **Não é enum.**
- `SELECT DISTINCT status FROM payouts` → **0 linhas** (tabela vazia hoje).

Conclusão: a coluna **já aceita** `'requested' | 'paid' | 'rejected'` (e qualquer string). Nada a alterar na coluna.

## Decisão sobre CHECK

Não vou adicionar `CHECK`. Motivos:
1. Sua instrução foi "na dúvida, não adicione".
2. O `DEFAULT` da coluna é `'pending'` (que você pediu para não mexer). Um CHECK restrito a `requested/paid/rejected` quebraria qualquer `INSERT` que caia no default. Incluir `'pending'` no CHECK fugiria do escopo da Fase 1.
3. Aditiva pura: validação de status fica para uma fase futura, junto com a RPC.

## Decisão sobre o índice

Aplicar exatamente o índice pedido. Idempotente (`IF NOT EXISTS`), parcial em `status = 'requested'`, garante no máximo 1 pedido pendente por evento.

## SQL proposto (único bloco da migration)

```sql
-- Fase 1: garantir no máximo um payout 'requested' por evento.
-- Não altera coluna status (já é text livre, aceita requested/paid/rejected).
-- Não altera default, policies, RLS, nem cria colunas/buckets.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payout_requested_per_event
  ON public.payouts (event_id)
  WHERE status = 'requested';
```

## O que NÃO faço nesta fase

- Não altero tipo nem default de `payouts.status`.
- Não adiciono `CHECK`.
- Não crio colunas, tabelas, policies, RLS, triggers, buckets.
- Não toco em linhas existentes (tabela está vazia de qualquer forma).
- Não mexo em nenhuma outra tabela.

Aprova para eu aplicar a migration?
