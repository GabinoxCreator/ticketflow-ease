# Frente D — Bloco 3: UI dos gráficos no AdminDashboard

Escopo: só `src/pages/admin/AdminDashboard.tsx` + novo hook `src/hooks/useAdminSalesTimeseries.ts`. Sem mexer em backend, RLS, edges ou outras telas.

## 1. Novo hook `src/hooks/useAdminSalesTimeseries.ts`

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DailyPoint  = { dia: string;  gmv: number };
export type HourlyPoint = { hora: number; pedidos: number };

export function useAdminSalesTimeseries() {
  return useQuery({
    queryKey: ['admin-sales-timeseries'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_sales_timeseries');
      if (error) throw error;
      const obj = (data ?? {}) as { daily?: DailyPoint[]; hourly?: HourlyPoint[] };
      return {
        daily:  Array.isArray(obj.daily)  ? obj.daily  : [],
        hourly: Array.isArray(obj.hourly) ? obj.hourly : [],
      };
    },
  });
}
```

- `data` é objeto jsonb único (não array) — leitura direta `data.daily` / `data.hourly`.
- `data` nulo → ambos viram `[]`.
- Coerção numérica: como vêm de jsonb, `gmv` e `pedidos` já chegam como number; sem normalização extra.

## 2. `src/pages/admin/AdminDashboard.tsx` — adição abaixo do Bloco 2

Manter Linha 1 (financeiro), Linha 2 (4 cards de contexto), faixa Mix+Top5. Adicionar **abaixo de tudo** uma seção com **duas cartas empilhadas, largura total**:

```
<div className="space-y-4">
  <Card>…AreaChart daily…</Card>
  <Card>…BarChart hourly…</Card>
</div>
```

### Imports novos
- `useAdminSalesTimeseries` do hook acima.
- De `recharts`: `AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, defs/linearGradient` (via JSX).
- `Skeleton` de `@/components/ui/skeleton`.

### (a) Card "Vendas ao longo do tempo" — AreaChart
- Dados: `daily` mapeado para `{ dia, gmv, label: formatDateBR(dia) }` onde `formatDateBR` faz `new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })` (regra do projeto para evitar UTC-3 shift — memória `mem://technical/date-parsing-logic`).
- `<defs><linearGradient id="gradGmv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5F6EF9" stopOpacity={0.45}/><stop offset="100%" stopColor="#5F6EF9" stopOpacity={0}/></linearGradient></defs>`
- `<Area dataKey="gmv" stroke="#5F6EF9" strokeWidth={2} fill="url(#gradGmv)" type="monotone" />`
- `XAxis dataKey="label"`, `YAxis tickFormatter={v => formatCurrencyCompact(v)}` (ex.: `R$ 1,2k`; reutilizar Intl).
- `Tooltip` custom: `<div>{label}</div><div>{formatCurrency(value)}</div>` no padrão `bg-background border rounded-md p-2 text-xs shadow`.
- `CartesianGrid strokeDasharray="3 3"` com `stroke="hsl(var(--border))"`.
- Altura ~280px via `ResponsiveContainer width="100%" height={280}`.
- **Vazio** (`daily.length === 0`): texto centralizado "Sem dados no período" (`text-sm text-muted-foreground py-12 text-center`).

### (b) Card "Horário de pico" — BarChart
- Dados: `hourly` (24 pontos garantidos pela RPC) mapeado para `{ hora, pedidos, label: \`${hora}h\` }`.
- `XAxis dataKey="label"` com `interval={0}` e `tickFormatter` que mostra apenas múltiplos de 3 + a hora 23 (`(v) => { const h = parseInt(v); return (h % 3 === 0 || h === 23) ? v : ''; }`).
- `YAxis allowDecimals={false}`.
- Cor base barras: `#5F6EF9`. Destacar máximo(s): calcular `maxPedidos = Math.max(...hourly.map(h=>h.pedidos))`; usar `<Cell fill={p.pedidos === maxPedidos && maxPedidos > 0 ? '#F766C6' : '#5F6EF9'} />` por barra dentro de `<Bar>`.
- `Tooltip` custom: `"${hora}h — ${pedidos} pedido${pedidos===1?'':'s'}"`.
- `CartesianGrid` igual ao (a).
- Altura ~280px.
- **Vazio**: se `hourly.every(h => h.pedidos === 0)` → "Sem dados no período".

### Loading
Enquanto `isLoading` do novo hook: cada card renderiza `<Skeleton className="h-[280px] w-full rounded-md" />` no lugar do gráfico (header do card permanece).

### Formatação
- `formatCurrency` (já existente no arquivo) para tooltip.
- Novo helper local `formatCurrencyCompact(n: number)`:
  ```ts
  new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', notation:'compact', maximumFractionDigits:1 }).format(n)
  ```

### Identidade visual
- Cores fixas só `#5F6EF9` (marca/indigo) e `#F766C6` (destaque/magenta) — alinhadas ao Bloco 2 (mix de pagamento).
- Cards usam o mesmo padrão dos demais (`Card` + `CardContent p-5`), com header interno: título `text-sm font-medium text-muted-foreground uppercase tracking-wider` e subtítulo opcional.
- Sem novas classes globais; herda `.admin-theme` do `AdminLayout`.

## Fora de escopo
Backend, RLS, edges, schema, outras telas, filtros de período (RPC já retorna histórico completo), exportação.
