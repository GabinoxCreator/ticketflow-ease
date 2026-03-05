

# Corrigir layout do dashboard mobile — gráfico e eventos ativos

## Problema

No mobile, o gráfico "Vendas por Mês" e o card "Eventos Ativos" ficam fora do centro/cortados. A causa raiz são dois problemas:

1. **Grid container** (linha 69): `grid gap-6 lg:grid-cols-2` — sem `min-w-0` nos filhos, o Recharts `ResponsiveContainer` pode causar overflow
2. **SalesChart**: `AreaChart` sem `margin` definida, fazendo o eixo Y cortar no mobile
3. **Container pai** (linha 25): `space-y-8` sem `min-w-0` para conter overflow

## Correção

### `src/pages/Dashboard.tsx`
- Linha 69: Adicionar `min-w-0` nos filhos do grid (envolver `SalesChart` e o `Card` de Eventos Ativos com `min-w-0`)
- Alternativamente, adicionar `overflow-hidden` no grid container

### `src/components/producer/SalesChart.tsx`
- Adicionar `margin={{ top: 5, right: 10, left: -15, bottom: 0 }}` ao `AreaChart` para que o eixo Y não corte
- Adicionar `width={40}` e `fontSize={11}` no `YAxis`
- Adicionar `fontSize={11}` e `tickMargin={8}` no `XAxis`
- Adicionar `min-w-0` no container div do gráfico

