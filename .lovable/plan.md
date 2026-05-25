## Objetivo

Adicionar um botão visível só para o admin (`userRole === 'admin'`) no dashboard do evento, que permite gerar N ingressos cortesia de um lote disponível, baixar os PDFs e contabilizar como "ingressos saídos" sem afetar a receita.

## Modelo de dados

Usar o campo existente `orders.sale_origin` com um novo valor: `'courtesy'` (hoje só `'online'` e `'manual'`). Sem migração — é um campo `text`.

- Order: `sale_origin='courtesy'`, `payment_method='courtesy'`, `status='paid'`, `total_amount=0`, `service_fee_amount=0`, `customer_*` preenchidos com dados informados no modal.
- Tickets: criados com `status='valid'` (não passam por `pending`).
- Estoque: `event_lots.sold_quantity` incrementado via `confirm_lot_sale` (após `reserve_lot_quantity`), igual ao fluxo pago — assim os ingressos aparecem em "Vendidos" e descontam da disponibilidade.

## Exclusão da receita

Atualizar as três queries de finanças/receita para ignorar `sale_origin='courtesy'`:

- `src/hooks/useProducerFinance.ts` (partição online/manual)
- `src/components/producer/tabs/EventFinanceiroTab.tsx`
- Qualquer agregação de `total_amount` em `useEventStats` que conte cortesia como receita (auditar e filtrar)

Cortesias continuam aparecendo em **Pedidos** e **Participantes** com badge "Cortesia", e contam em `sold_quantity` do lote e em "Ingressos Vendidos" do dashboard.

## Edge Function nova

`supabase/functions/admin-generate-courtesy-tickets/index.ts` (verify_jwt=true, validação extra `has_role(uid,'admin')` server-side — não confiar no frontend).

Input:
```
{ eventId, lotId, quantity, holderName, holderEmail, holderPhone? }
```

Fluxo:
1. Validar JWT + checar `has_role(user, 'admin')`.
2. Validar evento e lote (ativo, pertence ao evento).
3. `reserve_lot_quantity` → se ok, criar order cortesia → inserir N tickets `valid` → `confirm_lot_sale`.
4. Em qualquer erro: `release_lot_quantity` e rollback da order.
5. Retornar `{ orderId, tickets: [{id, lotName, holderName, qrPayload, ...}] }` com os dados que o `ticketPdf.ts` já consome.

## Frontend

**Componente novo**: `src/components/producer/admin/CourtesyTicketsButton.tsx` + `CourtesyTicketsModal.tsx`.

- Renderizado em `EventDashboardHeader.tsx` (linha de ações ao lado de "Editar"/"Despublicar").
- Visibilidade: `const { userRole } = useAuth(); if (userRole !== 'admin') return null;`
- Modal:
  - Select de lotes ativos do evento (label: "Pista — 23 disponíveis"), bloqueia lotes esgotados.
  - Input numérico de quantidade (1 a min(50, disponível)).
  - Nome do titular (default "Cortesia"), e-mail (default e-mail do admin logado), telefone opcional.
  - Botão "Gerar e baixar PDF".
- Ao sucesso: chama `generateTicketsPdf(tickets)` (reaproveita `src/utils/ticketPdf.ts` ou o multi-ticket usado pela venda manual) → dispara download → toast → invalida queries de orders/lots/stats.

## Estilo

Botão com tom admin (laranja/vermelho, alinhado a `mem://style/admin-panel-visual-distinction`) para deixar visualmente claro que é uma ação privilegiada, separada das ações normais do produtor.

## Auditoria

Inserir em `audit_logs` ação `courtesy_tickets_generated` com `{ event_id, lot_id, quantity, generated_by }` na própria edge function.

## Detalhes técnicos

- Não criar enum novo para `sale_origin` — manter `text` para não exigir migration agora.
- `payment_method='courtesy'` é novo valor; verificar se algum CHECK constraint na tabela `orders` restringe (não há trigger/constraint visível no schema atual, mas confirmar antes de implementar).
- PDF: usar o utilitário já existente que gera múltiplos ingressos numa venda manual (`src/utils/manualSaleTicketsPdf.ts`) para manter visual consistente.
- Cortesias devem aparecer em `EventParticipantsTab` e `EventCheckinTab` normalmente (são tickets `valid`).
- Em `EventOrdersTab`, mostrar badge "Cortesia" quando `sale_origin === 'courtesy'` (similar ao badge "Manual" hoje).

## Fora do escopo

- Cancelamento de cortesia (reaproveitar futuramente `cancel_manual_order` adaptado).
- Reenvio por e-mail automático (admin baixa PDF manualmente).
- UI para admin ver histórico separado de cortesias (filtro em Orders já basta).
