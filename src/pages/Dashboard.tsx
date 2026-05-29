import { useNavigate } from 'react-router-dom';
import { formatEventDate } from '@/lib/eventTime';

import {
  CalendarDays,
  Ticket,
  DollarSign,
  TrendingUp,
  Plus,
  ArrowRight,
  Receipt,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { EventStatsCard } from '@/components/producer/EventStatsCard';
import { SalesChart } from '@/components/producer/SalesChart';
import { EventListItem } from '@/components/producer/EventListItem';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEvents } from '@/hooks/useEvents';
import { useProducerStats } from '@/hooks/useProducerStats';
import { Skeleton } from '@/components/ui/skeleton';

const formatBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export default function Dashboard() {
  const navigate = useNavigate();
  const { events, activeEvents, isLoading, deleteEvent } = useEvents();
  const {
    totalRevenue,
    totalTicketsSold,
    totalCapacity,
    conversionRate,
    averageTicket,
    revenueTrend,
    ticketsTrend,
    nextEventDate,
    monthlySales,
  } = useProducerStats();

  const nextEventLabel = nextEventDate
    ? formatEventDate(nextEventDate, { day: '2-digit', month: 'short' })
    : null;


  return (
    <ProducerLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Visão Geral
            </h1>
            <p className="text-muted-foreground mt-1">
              Acompanhe suas métricas e gerencie seus eventos
            </p>
            {nextEventLabel && (
              <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary backdrop-blur">
                <Sparkles className="w-3 h-3" />
                Próximo evento em {nextEventLabel}
              </div>
            )}
          </div>
          <Button
            onClick={() => navigate('/produtor/criar-evento')}
            className="shadow-[0_0_30px_-10px_hsl(var(--primary))] bg-gradient-to-r from-primary to-accent hover:opacity-90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Criar Evento
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EventStatsCard
            title="Receita Total"
            value={formatBRL(totalRevenue)}
            icon={DollarSign}
            trend={
              revenueTrend !== 0
                ? { value: Math.abs(revenueTrend), isPositive: revenueTrend >= 0 }
                : undefined
            }
          />
          <EventStatsCard
            title="Ingressos Vendidos"
            value={totalTicketsSold}
            icon={Ticket}
            description={totalCapacity > 0 ? `de ${totalCapacity} disponíveis` : undefined}
            trend={
              ticketsTrend !== 0
                ? { value: Math.abs(ticketsTrend), isPositive: ticketsTrend >= 0 }
                : undefined
            }
          />
          <EventStatsCard
            title="Taxa de Conversão"
            value={conversionRate !== null ? `${conversionRate}%` : '—'}
            description={
              conversionRate !== null
                ? 'vendidos / capacidade'
                : 'Configure lotes para calcular'
            }
            icon={TrendingUp}
          />
          <EventStatsCard
            title="Ticket Médio"
            value={formatBRL(averageTicket)}
            description="por pedido pago"
            icon={Receipt}
          />
        </div>

        {/* Chart and Recent Events */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <SalesChart data={monthlySales} />
          </div>

          <Card className="min-w-0 relative overflow-hidden bg-card/60 backdrop-blur border-primary/10">
            <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 bg-gradient-to-br from-accent/20 to-primary/10 rounded-full blur-3xl opacity-50" />
            <CardHeader className="relative flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg p-1.5 bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
                  <CalendarDays className="w-4 h-4 text-primary" />
                </div>
                <CardTitle className="text-base md:text-lg">Eventos Ativos</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/produtor/eventos')}
                className="text-primary hover:text-primary hover:bg-primary/10"
              >
                Ver todos
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="relative">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : activeEvents.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center">
                    <CalendarDays className="w-7 h-7 text-primary" />
                  </div>
                  <p className="text-muted-foreground mb-4 text-sm">
                    Você ainda não tem eventos ativos
                  </p>
                  <Button
                    onClick={() => navigate('/produtor/criar-evento')}
                    variant="outline"
                    className="border-primary/30 hover:border-primary/60 hover:bg-primary/5"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Criar Primeiro Evento
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeEvents.slice(0, 3).map((event) => (
                    <EventListItem
                      key={event.id}
                      event={event}
                      onDelete={(id) => deleteEvent.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="relative overflow-hidden bg-card/60 backdrop-blur border-primary/10">
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Plus, label: 'Criar Evento', path: '/produtor/criar-evento' },
                { icon: CalendarDays, label: 'Gerenciar Eventos', path: '/produtor/eventos' },
                { icon: BarChart3, label: 'Ver Relatórios', path: '/produtor/eventos' },
                { icon: DollarSign, label: 'Pagamentos', path: '/produtor/financeiro' },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.path)}
                  className="group relative h-auto py-5 px-4 rounded-xl border border-border/50 bg-card/40 hover:border-primary/40 hover:bg-gradient-to-br hover:from-primary/10 hover:to-accent/10 transition-all flex flex-col items-center gap-2 overflow-hidden"
                >
                  <div className="rounded-lg p-2 bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 group-hover:scale-110 transition-transform">
                    <a.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{a.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ProducerLayout>
  );
}
