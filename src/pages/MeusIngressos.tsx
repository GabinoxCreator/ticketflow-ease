import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Ticket, Search } from 'lucide-react';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserTickets, UserTicket } from '@/hooks/useUserTickets';
import TicketCard, { TicketData } from '@/components/TicketCard';

const mapUserTicketToTicketData = (ticket: UserTicket): TicketData => ({
  id: ticket.id,
  ticketCode: ticket.ticket_code,
  holderName: ticket.holder_name,
  status: ticket.status,
  event: {
    title: ticket.event.title,
    date: ticket.event.date,
    time: ticket.event.time,
    venue: ticket.event.venue,
    city: ticket.event.city,
    state: ticket.event.state,
    imageUrl: ticket.event.image_url || undefined,
  },
  lot: {
    name: ticket.lot.name,
    price: ticket.lot.price,
  },
  purchaseDate: ticket.created_at,
  paymentMethod: 'Pix',
});

const TicketSkeleton = () => (
  <div className="bg-card rounded-2xl overflow-hidden shadow-lg border border-border">
    <Skeleton className="h-32 w-full" />
    <div className="p-4 space-y-3">
      <Skeleton className="h-6 w-3/4" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-44 col-span-2" />
      </div>
    </div>
    <div className="px-4 pb-4">
      <div className="flex gap-4">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="w-[116px] h-[116px] rounded-xl" />
      </div>
    </div>
    <div className="bg-muted/50 px-4 py-3 flex gap-2">
      <Skeleton className="h-9 flex-1" />
      <Skeleton className="h-9 flex-1" />
    </div>
  </div>
);

const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="text-center py-16"
  >
    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
      <Ticket className="w-10 h-10 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
    <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{description}</p>
    <Button variant="gradient" onClick={() => window.location.href = '/'}>
      Explorar Eventos
    </Button>
  </motion.div>
);

const MeusIngressos = () => {
  const { upcomingTickets, pastTickets, cancelledTickets, isLoading } = useUserTickets();

  return (
    <>
      <Helmet>
        <title>Meus Ingressos | IngressosRP</title>
        <meta name="description" content="Visualize e gerencie seus ingressos para eventos." />
      </Helmet>

      <Header />

      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Ticket className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
                Meus Ingressos
              </h1>
            </div>
            <p className="text-muted-foreground">
              Gerencie seus ingressos e acompanhe seus eventos
            </p>
          </motion.div>

          {/* Tabs */}
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="w-full sm:w-auto mb-6 bg-muted/50">
              <TabsTrigger value="upcoming" className="flex-1 sm:flex-none gap-2">
                <Ticket className="w-4 h-4" />
                Próximos
                {upcomingTickets.length > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary">
                    {upcomingTickets.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="past" className="flex-1 sm:flex-none gap-2">
                Anteriores
                {pastTickets.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {pastTickets.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="flex-1 sm:flex-none gap-2">
                Cancelados
                {cancelledTickets.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {cancelledTickets.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-6">
              {isLoading ? (
                <>
                  <TicketSkeleton />
                  <TicketSkeleton />
                </>
              ) : upcomingTickets.length > 0 ? (
                upcomingTickets.map((ticket) => (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <TicketCard ticket={mapUserTicketToTicketData(ticket)} />
                  </motion.div>
                ))
              ) : (
                <EmptyState
                  title="Nenhum ingresso encontrado"
                  description="Você ainda não tem ingressos para eventos futuros. Explore nossos eventos e garanta o seu!"
                />
              )}
            </TabsContent>

            <TabsContent value="past" className="space-y-6">
              {isLoading ? (
                <>
                  <TicketSkeleton />
                  <TicketSkeleton />
                </>
              ) : pastTickets.length > 0 ? (
                pastTickets.map((ticket) => (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <TicketCard ticket={mapUserTicketToTicketData(ticket)} />
                  </motion.div>
                ))
              ) : (
                <EmptyState
                  title="Nenhum evento anterior"
                  description="Você ainda não participou de nenhum evento. Comece explorando nossos eventos!"
                />
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="space-y-6">
              {isLoading ? (
                <TicketSkeleton />
              ) : cancelledTickets.length > 0 ? (
                cancelledTickets.map((ticket) => (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <TicketCard ticket={mapUserTicketToTicketData(ticket)} />
                  </motion.div>
                ))
              ) : (
                <EmptyState
                  title="Nenhum ingresso cancelado"
                  description="Você não tem nenhum ingresso cancelado."
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default MeusIngressos;
