# Visão Geral Premium + Métricas Reais

## Objetivo
Repaginar a tela `/produtor/dashboard` com o visual premium (indigo→magenta, glows, bordas suaves, gradientes) e fazer as métricas funcionarem de verdade — incluindo a Taxa de Conversão que hoje mostra `0%` fixo.

---

## 1. Métricas — fazer funcionar

Atualizar `src/hooks/useProducerStats.ts` para calcular dados reais adicionais:

- **Taxa de Conversão real**: `(ingressos pagos / capacidade total dos lotes) * 100`. Buscar `event_lots` dos eventos do produtor e somar `total_quantity`. Se capacidade = 0, mostra `—` em vez de `0%`.
- **Ticket Médio**: `receita total / nº de pedidos pagos`.
- **Variação mensal (trend)**: comparar receita / ingressos do mês atual vs mês anterior, retornar `% diferença` e sinal (positivo/negativo) para exibir nos cards.
- **Próximo evento**: data do próximo evento publicado.

Manter as queries existentes; só adicionar os cálculos derivados no `useMemo` final.

## 2. Cards de estatística premium

Criar variante visual nova nos 4 cards da Visão Geral (sem novo componente — adaptar `EventStatsCard` ou usar inline em `Dashboard.tsx`):

- Fundo: `bg-card/60` com `backdrop-blur` e borda `border-primary/10`.
- Glow sutil no canto superior direito (`bg-gradient-to-br from-primary/20 to-transparent blur-2xl`).
- Ícone num quadrado `rounded-xl` com gradiente `from-primary/20 to-accent/20` e ícone em `text-primary`.
- Valor em `text-3xl font-bold` com tracking apertado.
- Linha de trend (↑ 12% vs mês anterior) em verde/vermelho quando aplicável.
- Hover: `hover:border-primary/30 transition`.

Substituir os 4 cards por:
1. Receita Total (com trend)
2. Ingressos Vendidos (com trend)
3. Taxa de Conversão (real, com legenda "vendidos / capacidade")
4. Ticket Médio (R$ por pedido)

## 3. Header da página

- Título "Visão Geral" com gradiente `bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent`.
- Subtítulo mantém.
- Botão "Criar Evento" com glow `shadow-[0_0_30px_-10px_hsl(var(--primary))]`.
- Adicionar chip pequeno mostrando "Próximo evento: <data>" se houver.

## 4. Gráfico de vendas

Em `SalesChart.tsx`:
- Adicionar segunda Area para `receita` (gradient magenta/accent) sobreposta com opacidade baixa.
- Toggle de tabs no header: "Vendas" | "Receita" para alternar a métrica destacada.
- Tooltip premium: mostrar vendas + receita formatada em R$.
- Card com mesma identidade visual (border `primary/10`, glow sutil).

## 5. Card de Eventos Ativos

- Mesma identidade premium (border + glow).
- Estado vazio mais elegante: ícone num círculo com gradiente, copy mais leve.
- Itens da lista: usar miniatura quadrada com cantos `rounded-lg`, badge de status colorida (published = primary glow, draft = muted).

## 6. Ações Rápidas

- Grid 4 colunas com cards menores estilo "tile": ícone grande no topo + label.
- Cada tile com hover gradient sutil (`hover:bg-gradient-to-br hover:from-primary/10 hover:to-accent/10`).
- Manter as 4 ações atuais (Criar Evento, Gerenciar, Relatórios, Pagamentos).

---

## Arquivos a modificar

- `src/hooks/useProducerStats.ts` — adicionar capacidade total, ticket médio, trends mensais.
- `src/pages/Dashboard.tsx` — refatorar layout com cards premium, header com gradiente, taxa de conversão funcionando.
- `src/components/producer/SalesChart.tsx` — visual premium + toggle vendas/receita.
- `src/components/producer/EventStatsCard.tsx` — nova variante visual com glow + trend.

## Detalhes técnicos

- Capacidade total: `SELECT total_quantity FROM event_lots WHERE event_id IN (...)`.
- Trend mensal: comparar `monthlySales[5]` (atual) vs `monthlySales[4]` (anterior); `((atual - anterior) / anterior) * 100`, evitar divisão por zero.
- Ticket médio: `totalRevenue / totalOrders` formatado em BRL; mostrar `R$ 0,00` se 0 pedidos.
- Manter `react-query` cache atual; só estender o `queryFn`.
- Sem mudanças de schema, sem migrações, sem novas dependências.