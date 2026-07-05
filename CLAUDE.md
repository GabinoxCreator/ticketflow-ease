# CLAUDE.md — site-festpag (repo GitHub `ticketflow-ease`)

Site de venda de ingressos + painel do colaborador. React + TS (não-strict) + Vite/SWC + Tailwind/shadcn + TanStack Query v5 + Supabase (Postgres+RLS+RPCs SECURITY DEFINER + edges Deno). Pagamento Mercado Pago (webhook autoritativo). Projeto Supabase `nsrromaqysgoxqvqagdm`. Ver `../CLAUDE.md` para princípios.

## Build / verificação (só `bun` na máquina)
- Typecheck real: **`bun x tsc -p tsconfig.app.json --noEmit`** (passa limpo; `bun run build` usa vite/SWC e NÃO typecheca). tsconfig `strict:false`/`strictNullChecks:false`.
- `bun run lint` FALHA com ~353 problemas pré-existentes (maioria `no-explicit-any` nas edges) — não use como gate sem restringir ao arquivo tocado.

## Promoção de pedido para `paid` — o coração
- **NUNCA `UPDATE orders SET status='paid'` na mão.** Toda promoção pending→paid passa pela RPC transacional **`apply_order_approved`** (direta, ou via wrapper `_shared/applyOrderApproved.ts`). A RPC é idempotente e **RECUSA promover order sem tickets** (audita `paid_without_tickets_blocked`, retorna mismatch). Estado terminal (expired/cancelled/failed) não muta nada, só audita.
- **Wrapper vs RPC crua:** use o wrapper `applyOrderApproved()` quando DEVE sair e-mail de confirmação (webhook, polling, reconciliadores); use a RPC crua `supabase.rpc('apply_order_approved', ...)` quando o e-mail NÃO deve sair (é o que `collaborator-confirm-payment` faz de propósito). Em falha da RPC, audite `apply_order_approved_failed` ANTES de retornar erro.

## Webhook Mercado Pago = única fonte autoritativa de aprovação
- `mercadopago-webhook`: valida HMAC (x-signature/x-request-id), re-consulta o pagamento na API do MP, valida `transaction_amount` vs `order.total_amount` (tol. 0.01) ANTES de aprovar, deduplica via INSERT em `mp_webhook_events` (23505 = dup); se `applyOrderApproved` falhar, **DELETA a linha de dedupe** p/ o MP reprocessar. Edges de CRIAÇÃO de cobrança (`create-seat-pix`, `charge-seat-card`) NUNCA promovem — só o webhook.
- `create-mercadopago-preference` está NEUTRALIZADA (retorna 410) — não reativar.

## Edges do colaborador (`collaborator-*`, verify_jwt=false)
- Auth custom no body (`collaborator_id` + `session_token`): valide com `validateCollaboratorSession()` + `sessionErrorResponse()` de `_shared/collaboratorSession.ts` (transient→503, expirado→401), DEPOIS cheque vínculo em `collaborator_events` p/ o event_id (403 sem vínculo).
- Hash de session token = **SHA-256 hex via `hashToken()`** — NUNCA introduza bcrypt novo (bcrypt.compareSync no Deno tem falha WASM intermitente que causava logout aleatório).
- **`collaborator-confirm-payment`**: `VALID_METHODS = ['card_credit','card_debit','cash','pix']`; só `card_*` grava `pos_*`; exige `sale_origin='smartpos'`; grava `payment_method`/`pos_*` ANTES da RPC com guard `.eq('status','pending')` (0 linhas → 409). Prova do PIX (endToEndId/txid) NÃO é persistida (dívida conhecida).
- **`loadIssuedTickets`** é best-effort e NUNCA lança (erro → `[]`); a verdade financeira (`ok:true`) não depende dela. SEM embeds PostgREST ali (2 queries separadas). **`qr_payload = ticket_code CRU`** — idêntico ao que `collaborator-validate-ticket` lê na portaria; não reformatar.
- **`collaborator-reserve-order`**: preço vem SEMPRE do banco (`event_lots.price`), nunca do client; reserva estoque via RPC `reserve_lot_quantity` com rollback (`release_lot_quantity`) em qualquer falha; order nasce `pending` +30min, tickets `pending` 1/unidade; falha no insert de tickets → deleta order + libera estoque.

## Padrões transversais das edges
- **Transição concorrente**: UPDATE condicionado ao estado anterior + `.select().maybeSingle()`, 0 linhas = conflito. Ordem: **marcar estado PRIMEIRO, liberar inventário DEPOIS** (inverter reabre double-book sob carga).
- **Fail-closed** em validação crítica: rate limit e janela de check-in erram → 503 (nunca liberar silenciosamente).
- **Mesa vs ingresso**: use `tickets.event_seat_id` (imutável), NUNCA `event_seats.order_id` (é zerado por `release_seats_for_order`).
- Auditoria com `SYSTEM_ACTOR = '95628c4a-8040-44ed-83c5-d6a5b8793926'`; logue antes de lançar; engula falha do próprio log.
- Reutilize `_shared/`: `applyOrderApproved`, `collaboratorSession`, `rateLimit` (fail-closed), `cpf`, `event-ticket-limits` (exige client service-role), `orderConfirmationEmail` (idempotente, nunca lança). Não duplique.
- Toda edge nova precisa de entrada `[functions.<nome>] verify_jwt=true|false` no `config.toml` (true = usuário autenticado; false = colaborador/webhook/cron/público).

## Front
- **Client público vs autenticado**: use `supabasePublic` (`publicClient.ts`) SÓ p/ leitura pública (events, event_lots, seats); NUNCA p/ dado privado (orders/tickets/profiles) — sem sessão o RLS por `auth.uid()` volta vazio.
- Chamada a edge: colaborador → raw fetch com `Bearer <VITE_SUPABASE_PUBLISHABLE_KEY>` (verify_jwt=false, sessão no body); usuário Supabase logado → `supabase.functions.invoke`. Não misture.
- Mutação otimista: snapshot (`getQueryData`) → set otimista → revert em erro. Em conflito de concorrência, invalide a query (não reverta). Toasts com `sonner`; alias `@/`.

## Cuidado — o que NÃO bate com a doc antiga
- **FKs físicas EXISTEM** (migrations usam `REFERENCES ... ON DELETE CASCADE` amplamente). O que vive em RPC/RLS é a lógica de NEGÓCIO (promoção, estoque, idempotência), não a integridade referencial.
- **Migrations locais ≠ schema remoto**: colunas `pos_*` (e outras) existem no `types.ts`/banco mas não têm migration local — mudanças aplicadas direto no Supabase.
- `client.ts`/`types.ts` são auto-gerados — não editar.
- Alguns comentários no topo de edges são load-bearing p/ forçar redeploy no Lovable (ex.: `// redeploy 2026-06-28`).
