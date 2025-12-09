import { useMemo } from 'react';
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

interface SalesChartProps {
  data?: { date: string; vendas: number; receita: number }[];
}

// Mock data for demonstration
const mockData = [
  { date: 'Jan', vendas: 45, receita: 4500 },
  { date: 'Fev', vendas: 52, receita: 5200 },
  { date: 'Mar', vendas: 78, receita: 7800 },
  { date: 'Abr', vendas: 65, receita: 6500 },
  { date: 'Mai', vendas: 90, receita: 9000 },
  { date: 'Jun', vendas: 120, receita: 12000 },
];

export function SalesChart({ data = mockData }: SalesChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas por Mês</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Area
                type="monotone"
                dataKey="vendas"
                stroke="hsl(var(--primary))"
                fillOpacity={1}
                fill="url(#colorVendas)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
