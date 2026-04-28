## Painel do Evento — Premium + correções mobile + filtro de participantes

### 1. Header do evento (`EventDashboardHeader.tsx`) — Premium
- Substituir card sólido por **glass card** padrão FestPag (`bg-card/40 backdrop-blur-xl border border-primary/10 rounded-2xl` + linha de luz no topo).
- Banner do evento com overlay gradiente (de transparente → card) para contraste.
- Status badges em chips translúcidos coloridos (gradient indigo→magenta para "Ativo", âmbar para "Próximos dias", verde-esmeralda para "Em alta").
- Stats em mini-cards glass com ícones em chips ($, ticket, calendário). Removendo o "border-t" cru atual.
- Botões de ação (Voltar / Despublicar / Editar / Ver Página): variant `glass`, `rounded-xl`. Botão "Publicar" em gradient (Indigo→Magenta).

### 2. Tabs do dashboard (`EventDashboard.tsx`) — Mobile + visual
- Trocar `TabsList` por barra glass full-width (`bg-card/40 backdrop-blur-xl border border-primary/10 rounded-2xl p-1`).
- Triggers em pill, ativa com gradiente Indigo→Magenta. No mobile mostra só ícone, no `sm:` para cima ícone + label. Já é scrollable horizontalmente — adicionar `scrollbar-none` e `min-w-max` nos triggers.

### 3. EventOverviewTab — Premium
- Stats cards: glass + ícone em chip gradiente, número grande, label sutil.
- Card "Vendas por Mês" e "Ações Rápidas": mesmo padrão glass.
- Quick actions em grid 2 col (mobile) com botões glass + ícone em chip.

### 4. EventOrdersTab — Premium + fix mobile
**O bug de "botões cortados" na lateral acontece porque `TabsList` no shadcn renderiza inline-flex sem scroll, então no mobile as 4 abas (Todos/Pagos/Pendentes/Cancelados) estouram.**

- Envolver `TabsList` em `<div className="overflow-x-auto -mx-4 px-4 scrollbar-none">` e adicionar `w-max` no TabsList → permite scroll horizontal sem corte.
- TabsList ganha visual glass com pílula gradiente para aba ativa.
- Stats cards (Total/Pagos/Pendentes/Receita): glass + ícones coloridos em chip (Total=primary, Pagos=verde, Pendentes=âmbar, Receita=gradient).
- Search/Export: input com `rounded-xl bg-background/50`, botão Export glass.
- **Conteúdo de pedidos permanece exibindo TODOS** (incluindo pending) — perfeito para remarketing. Adicionar nota visual sutil no topo da aba "Pendentes": chip "💡 Use estes contatos para remarketing — clientes que iniciaram a compra mas não pagaram".

### 5. EventParticipantsTab — Premium + fix mobile + filtro correto
**Bug 1 — abas cortadas no mobile**: mesmo fix do orders (wrapper scrollable).

**Bug 2 — participantes incluindo pendentes**: hoje o hook traz todos os tickets do evento, e a aba "Todos" mostra `tickets.length` cru. Precisa filtrar para mostrar apenas quem **realmente comprou** (status `valid`, `used` ou `cancelled` — exclui `pending`).

Mudanças em `useEventParticipants.ts`:
- Filtrar a query para retornar apenas tickets com `status in ('valid','used','cancelled')`. Manter o select igual.
- Manter `validTickets` (não validados), `usedTickets` (validados) e `cancelledTickets`. Total = soma desses três.

Mudanças em `EventParticipantsTab.tsx`:
- Aplica visual glass igual ao OrdersTab (stats, search, tabs, lista).
- Stats cards mantém: Total / Não Validados / Validados / Cancelados.

### 6. Memória
Salvar memória nova: `mem://features/orders-vs-participants-distinction` documentando:
- Aba **Pedidos**: mostra TODOS os pedidos (pending/paid/cancelled) — usado para remarketing de carrinho abandonado.
- Aba **Participantes**: mostra apenas tickets de quem efetivamente comprou (valid/used/cancelled), excluindo pending.

### Arquivos a modificar
- `src/components/producer/EventDashboardHeader.tsx` — visual premium
- `src/pages/EventDashboard.tsx` — TabsList glass + scrollable mobile
- `src/components/producer/tabs/EventOverviewTab.tsx` — visual premium
- `src/components/producer/tabs/EventOrdersTab.tsx` — visual premium + fix mobile tabs + dica remarketing
- `src/components/producer/tabs/EventParticipantsTab.tsx` — visual premium + fix mobile tabs
- `src/hooks/useEventParticipants.ts` — filtrar status pendente da query
- `mem://features/orders-vs-participants-distinction` — nova memória + atualizar índice

### Fora de escopo
- Não alterar `EventDataTab`, `EventLotsTab`, `EventCheckinTab`, `EventDoorSalesTab`, `EventListsTab` neste loop (foco no que o usuário citou). Posso fazer no próximo passo se quiser.
- Sem mudanças no schema do banco.
