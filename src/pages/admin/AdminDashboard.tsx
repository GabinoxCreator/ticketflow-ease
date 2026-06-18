import React from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminStats } from '@/hooks/useAdminStats';
import { useAdminSalesTimeseries } from '@/hooks/useAdminSalesTimeseries';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Calendar, DollarSign, Banknote, TrendingUp, Loader2 } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';

const BRAND_INDIGO = '#5F6EF9';
const BRAND_MAGENTA = '#F766C6';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatCurrencyCompact = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
const formatNumber = (value: number) => value.toLocaleString('pt-BR');
const formatDateBR = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const DailyTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-md p-2 text-xs shadow">
      <div className="font-medium text-foreground">{label}</div>
      <div className="text-muted-foreground">{formatCurrency(Number(payload[0].value) || 0)}</div>
    </div>
  );
};

const HourlyTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { hora: number; pedidos: number };
  return (
    <div className="bg-background border rounded-md p-2 text-xs shadow">
      <div className="text-foreground">
        {p.hora}h — {p.pedidos} pedido{p.pedidos === 1 ? '' : 's'}
      </div>
    </div>
  );
};

const ChartCardHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="mb-4">
    <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
    {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
  </div>
);

const EmptyState: React.FC = () => (
  <div className="text-sm text-muted-foreground py-12 text-center">Sem dados no período</div>
);

const AdminDashboard: React.FC = () => {
  const { data: stats, isLoading } = useAdminStats();
  const { data: series, isLoading: seriesLoading } = useAdminSalesTimeseries();

  const financialCards = [
    { title: 'GMV', value: stats?.gmv || 0, icon: DollarSign, highlight: false },
    { title: 'Receita da Plataforma', value: stats?.platformRevenue || 0, icon: TrendingUp, highlight: true },
    { title: 'Repasses Pendentes', value: stats?.pendingPayouts || 0, icon: Banknote, highlight: false },
  ];

  const contextCards = [
    { title: 'Produtores', value: stats?.totalProducers || 0, icon: Users },
    { title: 'Eventos', value: stats?.totalEvents || 0, icon: Calendar },
  ];

  const daily = series?.daily ?? [];
  const hourly = series?.hourly ?? [];
  const dailyData = daily.map((d) => ({ ...d, label: formatDateBR(d.dia) }));
  const hourlyData = hourly.map((h) => ({ ...h, label: `${h.hora}h` }));
  const maxPedidos = hourlyData.reduce((m, p) => (p.pedidos > m ? p.pedidos : m), 0);
  const hourlyEmpty = hourlyData.length === 0 || maxPedidos === 0;
  const dailyEmpty = dailyData.length === 0;

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Visão Geral da Plataforma
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Indicadores em tempo real da operação FestPag.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Linha 1 — financeiro */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
              {financialCards.map((card) => (
                <Card
                  key={card.title}
                  className={
                    card.highlight
                      ? 'relative border-transparent shadow-md hover:shadow-lg transition-shadow admin-gradient-bg p-[1px]'
                      : 'border border-border bg-card shadow-sm hover:shadow-md transition-shadow'
                  }
                >
                  <CardContent
                    className={
                      card.highlight
                        ? 'p-5 rounded-[calc(var(--radius)-1px)] bg-card'
                        : 'p-5'
                    }
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {card.title}
                        </p>
                        <p
                          className={
                            card.highlight
                              ? 'font-display text-3xl font-semibold tabular-nums admin-gradient-text'
                              : 'font-display text-3xl font-semibold text-foreground tabular-nums'
                          }
                        >
                          {formatCurrency(card.value)}
                        </p>
                      </div>
                      <div className="h-10 w-10 rounded-xl admin-gradient-bg flex items-center justify-center shadow-sm shrink-0">
                        <card.icon className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Linha 2 — contexto (cards menores e discretos) */}
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {contextCards.map((card) => (
                <Card
                  key={card.title}
                  className="border border-border bg-muted/30 shadow-none"
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <card.icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {card.title}
                        </p>
                        <p className="font-display text-xl font-semibold text-foreground tabular-nums leading-tight">
                          {formatNumber(card.value)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Bloco 3 — séries temporais */}
            <div className="space-y-4">
              <Card className="border border-border bg-card shadow-sm">
                <CardContent className="p-5">
                  <ChartCardHeader title="Vendas ao longo do tempo" subtitle="GMV diário (horário de Brasília)" />
                  {seriesLoading ? (
                    <Skeleton className="h-[280px] w-full rounded-md" />
                  ) : dailyEmpty ? (
                    <EmptyState />
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradGmv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={BRAND_INDIGO} stopOpacity={0.45} />
                            <stop offset="100%" stopColor={BRAND_INDIGO} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="label"
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          tickFormatter={(v) => formatCurrencyCompact(Number(v) || 0)}
                          width={70}
                        />
                        <Tooltip content={<DailyTooltip />} cursor={{ stroke: BRAND_INDIGO, strokeOpacity: 0.2 }} />
                        <Area
                          type="monotone"
                          dataKey="gmv"
                          stroke={BRAND_INDIGO}
                          strokeWidth={2}
                          fill="url(#gradGmv)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-border bg-card shadow-sm">
                <CardContent className="p-5">
                  <ChartCardHeader title="Horário de pico" subtitle="Pedidos pagos por hora (horário de Brasília)" />
                  {seriesLoading ? (
                    <Skeleton className="h-[280px] w-full rounded-md" />
                  ) : hourlyEmpty ? (
                    <EmptyState />
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={hourlyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="label"
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          interval={0}
                          tickFormatter={(v: string) => {
                            const h = parseInt(v, 10);
                            return h % 3 === 0 || h === 23 ? v : '';
                          }}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          allowDecimals={false}
                          width={40}
                        />
                        <Tooltip content={<HourlyTooltip />} cursor={{ fill: BRAND_INDIGO, fillOpacity: 0.08 }} />
                        <Bar dataKey="pedidos" radius={[4, 4, 0, 0]}>
                          {hourlyData.map((p) => (
                            <Cell
                              key={p.hora}
                              fill={p.pedidos === maxPedidos && maxPedidos > 0 ? BRAND_MAGENTA : BRAND_INDIGO}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
