import { useNavigate } from 'react-router-dom';
import { CalendarDays, Ticket, DollarSign, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { EventStatsCard } from '@/components/producer/EventStatsCard';
import { SalesChart } from '@/components/producer/SalesChart';
import { EventListItem } from '@/components/producer/EventListItem';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEvents } from '@/hooks/useEvents';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const navigate = useNavigate();
  const { events, activeEvents, isLoading, deleteEvent } = useEvents();

  const totalEvents = events?.length || 0;
  const publishedEvents = events?.filter(e => e.status === 'published').length || 0;

  // Mock stats for now - in a real app these would come from the database
  const totalSold = 0;
  const totalRevenue = 0;

  return (
    <ProducerLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Visão Geral</h1>
            <p className="text-muted-foreground">
              Acompanhe suas métricas e gerencie seus eventos
            </p>
          </div>
          <Button onClick={() => navigate('/criar-evento')}>
            <Plus className="w-4 h-4 mr-2" />
            Criar Evento
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EventStatsCard
            title="Total de Eventos"
            value={totalEvents}
            description={`${publishedEvents} publicados`}
            icon={CalendarDays}
          />
          <EventStatsCard
            title="Ingressos Vendidos"
            value={totalSold}
            icon={Ticket}
            trend={{ value: 0, isPositive: true }}
          />
          <EventStatsCard
            title="Receita Total"
            value={`R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            icon={DollarSign}
            trend={{ value: 0, isPositive: true }}
          />
          <EventStatsCard
            title="Taxa de Conversão"
            value="0%"
            description="Visitas → Vendas"
            icon={TrendingUp}
          />
        </div>

        {/* Chart and Recent Events */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SalesChart />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Eventos Ativos</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/dashboard/eventos')}
              >
                Ver todos
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : activeEvents.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Você ainda não tem eventos ativos
                  </p>
                  <Button onClick={() => navigate('/criar-evento')} variant="outline">
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
        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate('/criar-evento')}
              >
                <Plus className="w-6 h-6" />
                <span>Criar Evento</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate('/dashboard/eventos')}
              >
                <CalendarDays className="w-6 h-6" />
                <span>Gerenciar Eventos</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate('/dashboard/relatorios')}
              >
                <TrendingUp className="w-6 h-6" />
                <span>Ver Relatórios</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => navigate('/dashboard/conta')}
              >
                <DollarSign className="w-6 h-6" />
                <span>Configurar Pagamentos</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProducerLayout>
  );
}
