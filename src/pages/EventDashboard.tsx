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
import { EventCouponsTab } from '@/components/producer/tabs/EventCouponsTab';
import { EventFinanceiroTab } from '@/components/producer/tabs/EventFinanceiroTab';
import { EventTablesTab } from '@/components/producer/tabs/EventTablesTab';
import { EventProductsTab } from '@/components/producer/tabs/EventProductsTab';
import { vocabularioAssento } from '@/lib/vocabularioAssento';
import { useEventStats } from '@/hooks/useEventStats';
import { useLojaHabilitada } from '@/hooks/useLojaHabilitada';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { ManualSaleModal } from '@/components/producer/ManualSaleModal';
import { LayoutDashboard, FileText, Ticket, ClipboardList, Users, Gift, Tag, Wallet, Armchair, ShoppingBag } from 'lucide-react';

export default function EventDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const { user } = useAuth();
  // Atalho "Venda manual" da visão geral: a mesma janela do botão do topo (OS-408).
  const [vendaManualAberta, setVendaManualAberta] = useState(false);
  
  const { data: event, isLoading: eventLoading, error } = useEvent(id);
  const { lojaHabilitada } = useLojaHabilitada();
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

  const showTables = event.event_type === 'mesa' || event.event_type === 'hibrido';
  // A loja está escondida por padrão (Gabriel, 01/10): só quem foi liberado vê.
  const mostrarLoja = lojaHabilitada;
  // Como este produtor chama o produto do mapa. No rodeio é "camarote" — e a
  // aba precisa dizer isso, não "Mesas": é o primeiro lugar em que ele olha.
  const vocab = vocabularioAssento((event as any).seat_noun);
  // Mesma regra do botão "+ Venda Manual" do topo (ManualSaleButton): só o dono do evento.
  const podeVenderManual = !!user && user.id === event.producer_id;

  // ⚠️ SEM "Check-in" e sem "Portaria" (Gabriel, 20/08). Os dois não pertencem
  // ao painel do produtor: o check-in acontece no app do colaborador e no
  // equipamento, e a portaria é outro produto, com outra operação.
  //
  // O histórico de portaria NÃO se perde: as 115 vendas já registradas (R$ 7.150,
  // de um evento só, a última em 25/05) continuam no banco e seguem entrando na
  // aba Financeiro e no fechamento. O que sai é a tela de lançar e consultar.
  // `EventCheckinTab` e `EventDoorSalesTab` continuam no repositório, sem uso —
  // apagar arquivo é decisão à parte.
  const tabItems = [
    { value: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
    { value: 'data', label: 'Dados', icon: FileText },
    { value: 'lots', label: 'Ingressos', icon: Ticket },
    ...(showTables ? [{ value: 'tables', label: vocab.Plural, icon: Armchair }] : []),
    ...(mostrarLoja ? [{ value: 'products', label: 'Produtos', icon: ShoppingBag }] : []),
    { value: 'orders', label: 'Pedidos', icon: ClipboardList },
    { value: 'participants', label: 'Participantes', icon: Users },
    { value: 'financeiro', label: 'Financeiro', icon: Wallet },
    { value: 'lists', label: 'Listas', icon: Gift },
    { value: 'coupons', label: 'Cupons', icon: Tag },
  ];

  const breadcrumbs = [
    { label: 'Visão Geral', href: '/produtor/dashboard' },
    { label: 'Meus Eventos', href: '/produtor/eventos' },
    { label: event.title },
  ];

  return (
    <ProducerLayout breadcrumbs={breadcrumbs}>
      <Helmet>
        <title>{event.title} - Painel do produtor | FestPag</title>
      </Helmet>

      <EventDashboardHeader 
        event={event} 
        totalRevenue={stats.totalRevenue}
        ticketsSold={stats.totalTicketsSold}
        courtesies={stats.totalCourtesies}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* No celular as abas viram uma faixa que rola de lado, com o nome escrito (OS-408):
            antes eram só ícones, e o produtor não sabia qual era qual. */}
        <TabsList className="flex justify-start sm:flex-wrap w-full gap-1 p-1 mb-6 h-auto overflow-x-auto bg-card/40 backdrop-blur-xl border border-primary/10 rounded-2xl">
          {tabItems.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex shrink-0 items-center justify-center gap-2 text-xs sm:text-sm whitespace-nowrap rounded-xl px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 transition-all"
            >
              <tab.icon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span>{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <EventOverviewTab
            eventId={event.id}
            eventSlug={event.slug ?? null}
            totalRevenue={stats.totalRevenue}
            ticketsSold={stats.totalTicketsSold}
            courtesies={stats.totalCourtesies}
            ticketsAvailable={stats.totalTicketsAvailable}
            conversionRate={stats.conversionRate}
            salesByLot={stats.salesByLot}
            salesByDay={stats.salesByDay}
            onTabChange={setActiveTab}
            onVendaManual={podeVenderManual ? () => setVendaManualAberta(true) : undefined}
          />
        </TabsContent>

        <TabsContent value="data">
          <EventDataTab event={event} />
        </TabsContent>

        <TabsContent value="lots">
          <EventLotsTab eventId={event.id} />
        </TabsContent>

        {showTables && (
          <TabsContent value="tables">
            <EventTablesTab eventId={event.id} eventTitle={event.title} />
          </TabsContent>
        )}

        <TabsContent value="products">
          <EventProductsTab eventId={event.id} />
        </TabsContent>

        <TabsContent value="orders">
          <EventOrdersTab eventId={event.id} event={event} />
        </TabsContent>

        <TabsContent value="participants">
          <EventParticipantsTab eventId={event.id} />
        </TabsContent>

        <TabsContent value="financeiro">
          <EventFinanceiroTab eventId={event.id} />
        </TabsContent>


        <TabsContent value="lists">
          <EventListsTab eventId={event.id} eventTime={event.time} />
        </TabsContent>

        <TabsContent value="coupons">
          <EventCouponsTab eventId={event.id} eventSlug={event.slug ?? null} />
        </TabsContent>
      </Tabs>

      {podeVenderManual && (
        <ManualSaleModal event={event} open={vendaManualAberta} onOpenChange={setVendaManualAberta} />
      )}
    </ProducerLayout>
  );
}
