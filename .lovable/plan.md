## Restaurar Bloco 2 + corrigir Repasses Pendentes no Admin Dashboard

Escopo: apenas `src/hooks/useAdminStats.ts` e `src/pages/admin/AdminDashboard.tsx`. Os dois gráficos existentes (AreaChart "Vendas ao longo do tempo" e BarChart "Horário de pico") permanecem intactos.

---

### 1) `src/hooks/useAdminStats.ts` — estender

Mudanças no hook:

- **Orders**: ampliar select para `'total_amount, service_fee_amount, payment_method, event_id'` com `.eq('status','paid')`.
- **Payouts**: já é `select('net_amount, status')` — manter; **garantir** que `pendingPayouts` filtra `status === 'requested'` (NÃO `'pending'`). Esse é o fix do bug 1.
- **Tickets**: nova query `supabase.from('tickets').select('id', { count:'exact', head:true }).in('status', ['valid','used'])` para contar ingressos vendidos/validados.
- **Events**: nova query `supabase.from('events').select('id, title')` em paralelo no `Promise.all` (sem embed; não há FK declarada de orders.event_id → events.id).
- Derivados client-side:
  - `paidOrders = orders.length`
  - `ticketsSold = ticketsRes.count || 0`
  - `mix = { pix: number, card: number }` — soma `total_amount` agrupado por `payment_method` com igualdade exata: `=== 'pix'` → pix, `=== 'card'` → card; qualquer outro valor ignorado (conforme instrução do usuário).
  - `topEvents`: agrupa soma de `total_amount` por `event_id`, junta com array de events pelo id para pegar `title`, ordena desc, fatia top 5 → `[{ eventId, title, gmv }]`. Eventos sem match caem com `title = 'Evento removido'`.
- Retorno final: `{ totalProducers, totalEvents, gmv, platformRevenue, pendingPayouts, paidOrders, ticketsSold, mix, topEvents }`.

---

### 2) `src/pages/admin/AdminDashboard.tsx` — restaurar Bloco 2 sem remover gráficos

Layout final (de cima para baixo):

```text
Linha 1  [ GMV ] [ Receita da Plataforma (destaque admin-gradient) ] [ Repasses Pendentes ]
Linha 2  [ Pedidos pagos ] [ Ingressos vendidos ] [ Produtores ] [ Eventos ]    (4 cards menores)
Bloco 2  [ Mix de pagamento (donut recharts) ] [ Top 5 eventos por vendas (lista + barras) ]
Bloco 3  [ Vendas ao longo do tempo (AreaChart) — JÁ EXISTENTE, mantido           ]
         [ Horário de pico (BarChart)       — JÁ EXISTENTE, mantido               ]
```

Detalhes:

- **Linha 1**: sem mudanças além de garantir o valor correto de Repasses Pendentes. Destaque atual no card "Receita da Plataforma" permanece.
- **Linha 2**: expandir de 2 cards para **4 cards** no mesmo estilo discreto (`bg-muted/30 shadow-none p-3`), grid `grid-cols-2 md:grid-cols-4 max-w-3xl`. Cards:
  - Pedidos pagos (ícone `ShoppingBag`): valor = `stats.paidOrders`
  - Ingressos vendidos (ícone `Ticket`): valor = `stats.ticketsSold`
  - Produtores (ícone `Users`): valor = `stats.totalProducers`
  - Eventos (ícone `Calendar`): valor = `stats.totalEvents`
- **Bloco 2 — Mix de pagamento** (`Card` lado esquerdo de grid `md:grid-cols-2 gap-4`):
  - `PieChart` recharts em donut (`innerRadius=60, outerRadius=90`).
  - Dados filtrados para `value > 0`: `[{ name:'PIX', value: mix.pix, color:'#5F6EF9' }, { name:'Cartão', value: mix.card, color:'#F766C6' }]`.
  - Legenda custom abaixo do gráfico com: nome · valor `R$` formatado pt-BR · `%` do total.
  - Vazio (`mix.pix + mix.card === 0`): renderiza "Sem dados no período".
- **Bloco 2 — Top 5 eventos** (`Card` lado direito):
  - Lista ordenada 1..5; cada linha: posição numérica, título do evento (`truncate`), valor `R$` alinhado à direita, barra horizontal proporcional ao maior GMV (gradiente da marca via `linear-gradient(90deg,#5F6EF9,#EC4899)`), largura `Math.max(2, gmv/maxGmv*100)%`.
  - Vazio (lista zerada): "Sem dados no período".
- **Bloco 3**: NÃO TOCAR — manter exatamente como está hoje.
- **Formatação**: `Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })` (helper `formatCurrency` já existe). `formatNumber` para contagem de pedidos/ingressos.
- **Loading**: enquanto `isLoading`, Bloco 2 exibe `<Skeleton className="h-[280px] w-full rounded-md" />` em cada card.
- **Estados vazios**: Bloco 2 inteiro exibe "Sem dados no período" quando `dailyEmpty` e `hourlyEmpty` também se aplicam — na prática, se não há orders pagas, mix e top5 também estarão vazios.