import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { EventDashboardHeader } from '@/components/producer/EventDashboardHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EventOverviewTab } from '@/components/producer/tabs/EventOverviewTab';
import { EventDataTab } from '@/components/producer/tabs/EventDataTab';
import { EventLotsTab } from '@/components/producer/tabs/EventLotsTab';
import { EventOrdersTab } from '@/components/producer/tabs/EventOrdersTab';
import { EventParticipantsTab } from '@/components/producer/tabs/EventParticipantsTab';
import { EventListsTab } from '@/components/producer/tabs/EventListsTab';
import { useEvent } from '@/hooks/useEvents';
import { EventCheckinTab } from '@/components/producer/tabs/EventCheckinTab';
import { EventDoorSalesTab } from '@/components/producer/tabs/EventDoorSalesTab';
import { useEventStats } from '@/hooks/useEventStats';
import { Skeleton } from '@/components/ui/skeleton';
import { LayoutDashboard, FileText, Ticket, ClipboardList, Users, Gift, ScanLine, DollarSign } from 'lucide-react';

export default function EventDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  
  const { data: event, isLoading: eventLoading, error } = useEvent(id);
  const stats = useEventStats(id);

  if (eventLoading || stats.isLoading) {
    return (
      <ProducerLayout>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </ProducerLayout>
    );
  }

  if (error || !event) {
    return (
      <ProducerLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="text-xl font-semibold mb-2">Evento não encontrado</h2>
          <p className="text-muted-foreground mb-4">
            O evento que você está procurando não existe ou você não tem permissão para acessá-lo.
          </p>
          <button 
            onClick={() => navigate('/produtor/eventos')}
            className="text-primary hover:underline"
          >
            Voltar para Meus Eventos
          </button>
        </div>
      </ProducerLayout>
    );
  }

  const tabItems = [
    { value: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
    { value: 'data', label: 'Dados', icon: FileText },
    { value: 'lots', label: 'Lotes', icon: Ticket },
    { value: 'orders', label: 'Pedidos', icon: ClipboardList },
    { value: 'participants', label: 'Participantes', icon: Users },
    { value: 'checkin', label: 'Check-in', icon: ScanLine },
    { value: 'doorsales', label: 'Portaria', icon: DollarSign },
    { value: 'lists', label: 'Listas', icon: Gift },
  ];

  const breadcrumbs = [
    { label: 'Dashboard', href: '/produtor/dashboard' },
    { label: 'Meus Eventos', href: '/produtor/eventos' },
    { label: event.title },
  ];

  return (
    <ProducerLayout breadcrumbs={breadcrumbs}>
      <Helmet>
        <title>{event.title} - Dashboard | FestPag</title>
      </Helmet>

      <EventDashboardHeader 
        event={event} 
        totalRevenue={stats.totalRevenue} 
        ticketsSold={stats.totalTicketsSold} 
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full mb-6 overflow-x-auto">
          {tabItems.map((tab) => (
            <TabsTrigger 
              key={tab.value} 
              value={tab.value}
              className="flex items-center gap-2 text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
            >
              <tab.icon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <EventOverviewTab
            eventId={event.id}
            totalRevenue={stats.totalRevenue}
            ticketsSold={stats.totalTicketsSold}
            ticketsAvailable={stats.totalTicketsAvailable}
            conversionRate={stats.conversionRate}
            salesByLot={stats.salesByLot}
            salesByDay={stats.salesByDay}
            onTabChange={setActiveTab}
          />
        </TabsContent>

        <TabsContent value="data">
          <EventDataTab event={event} />
        </TabsContent>

        <TabsContent value="lots">
          <EventLotsTab eventId={event.id} />
        </TabsContent>

        <TabsContent value="orders">
          <EventOrdersTab eventId={event.id} />
        </TabsContent>

        <TabsContent value="participants">
          <EventParticipantsTab eventId={event.id} />
        </TabsContent>

        <TabsContent value="checkin">
          <EventCheckinTab eventId={event.id} />
        </TabsContent>

        <TabsContent value="doorsales">
          <EventDoorSalesTab eventId={event.id} />
        </TabsContent>

        <TabsContent value="lists">
          <EventListsTab eventId={event.id} />
        </TabsContent>
      </Tabs>
    </ProducerLayout>
  );
}
