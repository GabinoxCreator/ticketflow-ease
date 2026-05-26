## Painel "Ao Vivo" para Colaborador

Nova tela acessível apenas por colaboradores logados, mostrando KPIs principais e feed de vendas em tempo real (online + manual + portaria somados).

### Acesso

- Rota nova: `/colaborador/eventos/:id/ao-vivo` (protegida por `ColaboradorProtectedRoute` + verificação de vínculo via `collaborator_events`).
- Adicionar botão "Ao Vivo" no `ColaboradorEvento` (ao lado das abas já existentes) para o próprio colaborador abrir. Sem entrada pública/sem token — só funciona logado.
- O produtor compartilha enviando login/senha do colaborador já existente (fluxo atual).

### Métricas (escopo: tudo somado — online pago + manual pago + portaria)

KPIs no topo, atualizados em tempo real:
- **Receita total** (R$): soma de `orders.total_amount` onde `status='paid'` + `door_sales.total_amount`.
- **Ingressos vendidos**: count de `tickets` com `status IN ('valid','used')` + sum de `door_sales.quantity`.
- **Ingressos disponíveis**: sum de `event_lots.total_quantity - sold_quantity` (lotes ativos).
- **Ticket médio**: receita total / ingressos vendidos.

Feed ao vivo abaixo (lista das últimas ~30 vendas, ordenadas por hora desc):
- Origem (Online / Manual / Portaria) com badge colorido.
- Nome do comprador (de `orders.customer_name` ou "Venda Portaria" para door_sales).
- Lote, quantidade, valor, hora ("há 2 min").
- Item novo entra com animação de fade-in + leve glow indigo→magenta.

### Tempo real

- Realtime do Supabase via `supabase.channel()` em:
  - `orders` (filtrado por `event_id`, evento `UPDATE` para pegar transição → paid)
  - `tickets` (filtrado por `event_id`, evento `INSERT`)
  - `door_sales` (filtrado por `event_id`, evento `INSERT`)
- Indicador "AO VIVO" pulsante (ponto verde animado) no header da tela.
- Fallback: refetch a cada 20s caso o realtime caia.
- Habilitar `REPLICA IDENTITY FULL` e `ALTER PUBLICATION supabase_realtime ADD TABLE` para as 3 tabelas (migration).

### Backend

Nova Edge Function `collaborator-live-stats` (segue padrão das outras: valida `collaborator_id` + `session_token` via `validateCollaboratorSession`, checa `collaborator_events` para o `event_id`). Retorna:
```json
{
  "kpis": { "revenue", "ticketsSold", "ticketsAvailable", "avgTicket" },
  "recent": [{ "id", "source", "customer_name", "lot_name", "quantity", "amount", "created_at" }, ...]
}
```
Frontend usa essa função no load inicial e como fallback; updates incrementais vêm pelo realtime.

### Arquivos

Novos:
- `src/components/colaborador/ColaboradorAoVivoTab.tsx` — UI (KPIs + feed + indicador AO VIVO).
- `src/hooks/useColaboradorLiveStats.ts` — query inicial + subscription realtime + merge incremental.
- `supabase/functions/collaborator-live-stats/index.ts` — agrega KPIs e feed.
- Migration: habilitar realtime para `orders`, `tickets`, `door_sales`.

Editados:
- `src/pages/colaborador/ColaboradorEvento.tsx` — adicionar tab/rota "Ao Vivo" (Icon `Radio` ou `Activity`).
- `src/components/colaborador/ColaboradorBottomNav.tsx` — adicionar item "Ao Vivo" no bottom nav (vira 5 abas) **ou** manter como sub-rota dentro do evento, sem mexer no bottom nav. Recomendo a 2ª opção pra não inchar o nav.

### Visual

- Fundo escuro do tema colaborador, cards glassmorphism.
- KPIs grandes em 2×2 no mobile, 4 colunas no desktop, números com gradient indigo→magenta.
- Header com badge "● AO VIVO" verde pulsante + nome do evento.
- Feed com timeline vertical, badge de origem colorido (Online=indigo, Manual=amber, Portaria=emerald).

### Validação

- Login como colaborador vinculado → abrir aba Ao Vivo → ver KPIs e feed.
- Disparar uma venda manual/portaria em outra aba → confirmar que o card aparece no feed sem refresh.
- Colaborador NÃO vinculado ao evento → 403.
- Sem login → redireciona pra `/colaborador/login`.

Aprovar pra eu implementar.