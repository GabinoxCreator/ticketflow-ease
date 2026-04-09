

# Fase 3 — Evolução do Painel do Produtor

---

## 1. Diagnóstico do Painel Atual

O painel existe e funciona com `ProducerLayout` + `ProducerSidebar`. Há 6 páginas de produtor ativas:
- `Dashboard.tsx` — visão geral com stats mockados (totalSold=0, totalRevenue=0)
- `DashboardEventos.tsx` — listagem com tabs (ativos/rascunhos/passados/todos)
- `EventDashboard.tsx` — dashboard do evento com 6 tabs internas (overview, dados, lotes, pedidos, participantes, listas)
- `CriarEvento.tsx` / `EditarEvento.tsx` — formulários de evento
- `Financeiro.tsx` — dados bancários com PIN
- `ColaboradoresManager.tsx` — gestão de colaboradores

**Hooks existentes**: `useEvents`, `useEventLots`, `useEventOrders`, `useEventParticipants`, `useEventStats`, `useGuestLists`, `useCollaborators`, `useImageUpload`

**Componentes de tabs existentes**: `EventOverviewTab`, `EventDataTab`, `EventLotsTab`, `EventOrdersTab`, `EventParticipantsTab`, `EventListsTab`

---

## 2. Componentes Reutilizáveis (já prontos)

Tudo abaixo pode ser reaproveitado com ajustes mínimos:
- `ProducerLayout` + `ProducerSidebar` — layout e navegação
- `EventStatsCard`, `SalesChart`, `LotSummaryCard` — cards de métricas
- `EventListItem`, `OrderListItem`, `ParticipantListItem` — itens de lista
- `LotManager` — CRUD de lotes
- `AddGuestListDialog`, `GuestListEntriesManager` — listas de convidados
- `ImageUpload` — upload de imagem
- `BankAccountCard`, `PinSetupCard`, `PinVerificationDialog` — financeiro
- Todos os hooks de dados (`useEventLots`, `useEventOrders`, etc.)

---

## 3. Problemas Encontrados — Rotas Legadas Não Migradas

Vários componentes internos ainda apontam para rotas antigas:

| Arquivo | Rota legada | Deveria ser |
|---|---|---|
| `EventListItem.tsx` L41 | `/dashboard/evento/${id}` | `/produtor/eventos/${id}` |
| `EventListItem.tsx` L105 | `/editar-evento/${id}` | `/produtor/editar-evento/${id}` |
| `EventDashboardHeader.tsx` L43 | `/dashboard/eventos` | `/produtor/eventos` |
| `EventDashboardHeader.tsx` L99 | `/editar-evento/${id}` | `/produtor/editar-evento/${id}` |
| `EventDataTab.tsx` L135 | `/editar-evento/${id}` | `/produtor/editar-evento/${id}` |
| `EventDashboard.tsx` L50 | `/dashboard/eventos` | `/produtor/eventos` |
| `EventDashboard.tsx` L72 | Título "Ingressos" | "FestPag" |
| `CriarEvento.tsx` L137,155,156,166 | `/dashboard/eventos`, `/dashboard` | `/produtor/eventos`, `/produtor/dashboard` |
| `EditarEvento.tsx` L173,194 | `/dashboard/eventos` | `/produtor/eventos` |
| `DashboardEventos.tsx` L70,113 | `/criar-evento` | `/produtor/criar-evento` |

---

## 4. Estratégia de Navegação

**Sidebar** — adicionar itens que faltam:
- Pedidos (`/produtor/pedidos`) — visão global de pedidos de todos os eventos
- Configurações (`/produtor/configuracoes`) — página de settings do produtor

**Sub-rotas de evento** — manter como tabs internas no `EventDashboard` (já funciona assim), sem criar rotas separadas para `/eventos/:id/lotes`, `/eventos/:id/participantes`, etc. Isso é mais simples e já está implementado. As rotas do requisito (`/produtor/eventos/:id/lotes`, etc.) podem ser adicionadas no futuro se necessário, mas atualmente as tabs resolvem o problema.

---

## 5. Proposta de Implementação — Fase 3 em Blocos

### Fase 3A — Correção de Rotas Legadas + Branding Residual
- Corrigir todas as 10+ referências de rotas antigas listadas acima
- Corrigir título Helmet do `EventDashboard.tsx` ("Ingressos" → "FestPag")
- Impacto: 6 arquivos, sem risco funcional

### Fase 3B — Dashboard com Métricas Reais + Melhorias de UX
- Conectar stats do `Dashboard.tsx` a dados reais (somar tickets vendidos e receita de todos os eventos do produtor, em vez de hardcoded 0)
- Criar hook `useProducerStats` que agrega dados de `orders` e `tickets` de todos os eventos
- Melhorar `SalesChart` para usar dados reais
- Adicionar exportação CSV nos botões de "Exportar" (Pedidos e Participantes)

### Fase 3C — Novos Módulos do Painel
- **`/produtor/pedidos`** — página global de pedidos de todos os eventos (reutiliza `OrderListItem` + `useEventOrders` adaptado para multi-evento)
- **`/produtor/configuracoes`** — página de configurações do produtor (dados do perfil, preferências)
- Adicionar itens no `ProducerSidebar`
- Adicionar check-in tab no `EventDashboard` — tab "Check-in" com busca por código/nome e botão de validar (reutiliza `useEventParticipants` + edge function `collaborator-validate-ticket`)
- Adicionar tab "Portaria" no `EventDashboard` para vendas na portaria (se tabela `door_sales` existir — precisa verificar)

---

## 6. Arquivos Impactados por Fase

**3A** (6 arquivos):
- `src/components/producer/EventListItem.tsx`
- `src/components/producer/EventDashboardHeader.tsx`
- `src/components/producer/tabs/EventDataTab.tsx`
- `src/pages/EventDashboard.tsx`
- `src/pages/CriarEvento.tsx`
- `src/pages/EditarEvento.tsx`
- `src/pages/DashboardEventos.tsx`

**3B** (4 arquivos):
- Novo: `src/hooks/useProducerStats.ts`
- `src/pages/Dashboard.tsx`
- `src/components/producer/SalesChart.tsx`
- `src/components/producer/tabs/EventParticipantsTab.tsx` (exportação CSV)
- `src/components/producer/tabs/EventOrdersTab.tsx` (exportação CSV)

**3C** (5+ arquivos):
- Novo: `src/pages/ProducerOrders.tsx`
- Novo: `src/pages/ProducerSettings.tsx`
- Novo: `src/components/producer/tabs/EventCheckinTab.tsx`
- `src/components/producer/ProducerSidebar.tsx` (novos itens)
- `src/components/producer/ProducerLayout.tsx` (novas rotas no breadcrumb)
- `src/App.tsx` (novas rotas)

---

## 7. Queries/Hooks/Tabelas Impactadas

- **Sem mudança de schema** — todas as tabelas existentes (`events`, `event_lots`, `orders`, `tickets`, `guest_lists`, `guest_list_entries`) são suficientes
- Novo hook: `useProducerStats` (SELECT agregado em `orders` + `tickets` filtrado por `events.producer_id`)
- Adaptação: `useEventOrders` pode receber `eventId?: string` ou `all: boolean` para modo global
- Tabela `door_sales` não existe no schema atual — a tab de portaria ficaria como placeholder ou precisaria de migração SQL

---

## 8. Riscos Técnicos

| Risco | Mitigação |
|---|---|
| Rotas legadas em componentes internos causam navegação quebrada | Fase 3A corrige todas antes de avançar |
| Dashboard stats mockados dão impressão de sistema incompleto | Fase 3B conecta a dados reais |
| Tabela `door_sales` não existe | Deixar como placeholder ou criar migração simples na Fase 3C |
| RLS em `orders`/`tickets` não permite SELECT global do produtor sem `event_id` | Os hooks atuais já filtram por `event_id` via join com `events.producer_id` — funciona |

---

## 9. Ordem de Implementação Recomendada

1. **Fase 3A primeiro** — correção de rotas e branding residual (risco zero, alto impacto)
2. **Fase 3B segundo** — dashboard real + exportação CSV
3. **Fase 3C terceiro** — novos módulos (pedidos globais, configurações, check-in)

Devo implementar a Fase 3A imediatamente?

