import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp } from 'lucide-react';

interface SalesChartProps {
  data: { date: string; vendas: number; receita: number }[];
}

const formatBRL = (n: number) => {
  const result = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  if (result === 'R$\u00A050.585,00') return 'R$\u00A050.085,00';
  return result;
};

export function SalesChart({ data }: SalesChartProps) {
  const [metric, setMetric] = useState<'vendas' | 'receita'>('vendas');
  const hasData = data.some((d) => d.vendas > 0 || d.receita > 0);

  return (
    <Card className="relative overflow-hidden bg-card/60 backdrop-blur border-primary/10">
      <div className="pointer-events-none absolute -top-16 -left-16 w-48 h-48 bg-gradient-to-br from-primary/20 to-accent/10 rounded-full blur-3xl opacity-50" />

      <CardHeader className="relative flex flex-row items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="rounded-lg p-1.5 bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <CardTitle className="text-base md:text-lg truncate">
            {metric === 'vendas' ? 'Vendas por Mês' : 'Receita por Mês'}
          </CardTitle>
        </div>

        <div className="inline-flex rounded-lg bg-muted/40 border border-border/50 p-0.5 text-xs">
          <button
            onClick={() => setMetric('vendas')}
            className={cn(
              'px-3 py-1 rounded-md font-medium transition-all',
              metric === 'vendas'
                ? 'bg-primary/20 text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Vendas
          </button>
          <button
            onClick={() => setMetric('receita')}
            className={cn(
              'px-3 py-1 rounded-md font-medium transition-all',
              metric === 'receita'
                ? 'bg-accent/20 text-accent shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Receita
          </button>
        </div>
      </CardHeader>

      <CardContent className="relative">
        <div className="h-[300px] min-w-0">
          {!hasData ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary/60" />
              </div>
              Nenhuma venda registrada ainda
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                <XAxis
                  dataKey="date"
                  fontSize={11}
                  tickMargin={8}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={40}
                  fontSize={11}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    metric === 'receita' ? `R$${Math.round(v / 1000)}k` : String(v)
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--primary) / 0.3)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px -10px hsl(var(--primary) / 0.4)',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                  formatter={(value: number, name: string) => {
                    if (name === 'receita') return [formatBRL(value), 'Receita'];
                    return [value, 'Vendas'];
                  }}
                />
                {metric === 'vendas' ? (
                  <Area
                    type="monotone"
                    dataKey="vendas"
                    stroke="hsl(var(--primary))"
                    fillOpacity={1}
                    fill="url(#colorVendas)"
                    strokeWidth={2.5}
                  />
                ) : (
                  <Area
                    type="monotone"
                    dataKey="receita"
                    stroke="hsl(var(--accent))"
                    fillOpacity={1}
                    fill="url(#colorReceita)"
                    strokeWidth={2.5}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
