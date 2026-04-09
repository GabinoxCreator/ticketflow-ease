

# Fase 3 — Consolidação do Painel do Produtor

## Diagnóstico

O painel do produtor já está **bastante completo** após as implementações anteriores. Todas as rotas, tabs, hooks e componentes principais existem e funcionam. O que falta é **consolidação, polimento e pequenos ajustes**.

### O que já existe e funciona:
- Dashboard com métricas reais (`useProducerStats`)
- Listagem de eventos com tabs e busca
- EventDashboard com 7 tabs (Overview, Dados, Lotes, Pedidos, Participantes, Check-in, Listas)
- Pedidos globais (`/produtor/pedidos`)
- Financeiro, Equipe, Configurações
- Exportação CSV em pedidos e participantes
- Sidebar com todos os itens de menu

### Problemas encontrados:

1. **SalesChart usa dados mock** — o componente tem `mockData` hardcoded como default; o Dashboard global passa esses mocks, enquanto o EventOverviewTab passa dados reais
2. **Dashboard global não tem gráfico real** — passa `mockData` implicitamente (sem prop `data`)
3. **ProducerLayout overflow** — `overflow-hidden` no main pode cortar conteúdo em scroll
4. **Sidebar agrupa cada item em seu próprio SidebarGroup** — desnecessariamente verboso (Equipe, Gestão, Financeiro, Configurações cada um como grupo separado)
5. **Breadcrumbs do EventDashboard** — não passam breadcrumbs customizados com nome do evento
6. **Tabs do EventDashboard em grid-cols-7** — fica apertado no mobile, não responsivo

---

## Plano de Implementação

### BLOCO 1 — Layout e Sidebar
- **ProducerSidebar.tsx**: Consolidar grupos do sidebar (agrupar Pedidos, Financeiro e Equipe sob "Gestão"; Configurações separado)
- **ProducerLayout.tsx**: Trocar `overflow-hidden` por `overflow-auto` no main

### BLOCO 2 — Dashboard
- **Dashboard.tsx**: Passar dados reais de vendas mensais ao SalesChart (agregar de orders por mês) via novo hook ou inline query
- **SalesChart.tsx**: Remover mockData default, exigir prop `data`
- **useProducerStats.ts**: Adicionar dados de vendas mensais ao retorno

### BLOCO 3 — EventDashboard responsividade
- **EventDashboard.tsx**: Tornar TabsList responsiva (scroll horizontal no mobile em vez de grid-cols-7), passar breadcrumbs com nome do evento ao ProducerLayout

### BLOCO 4-8 — Já implementados
Os blocos 4 a 8 do requisito (eventos/:id overview, lotes, participantes, checkin, listas) já estão implementados como tabs no EventDashboard. Nenhuma alteração necessária além do que está no Bloco 3.

### BLOCO 9 — Padronização visual
- **ProducerOrders.tsx**, **Financeiro.tsx**, **ColaboradoresManager.tsx**, **ProducerSettings.tsx**: Adicionar Helmet onde faltar, padronizar header (título + descrição)
- **ColaboradoresManager.tsx**: Adicionar Helmet com título FestPag

---

## Arquivos impactados

| Arquivo | Alteração |
|---|---|
| `src/components/producer/ProducerSidebar.tsx` | Consolidar grupos do menu |
| `src/components/producer/ProducerLayout.tsx` | Fix overflow |
| `src/pages/Dashboard.tsx` | Dados reais no gráfico |
| `src/components/producer/SalesChart.tsx` | Remover mock default |
| `src/hooks/useProducerStats.ts` | Adicionar vendas mensais |
| `src/pages/EventDashboard.tsx` | Tabs responsivas + breadcrumbs |
| `src/pages/ColaboradoresManager.tsx` | Adicionar Helmet |

## Riscos
- Nenhum risco estrutural — são ajustes incrementais de polimento
- Nenhuma alteração de banco de dados
- Nenhum impacto na área pública do cliente

