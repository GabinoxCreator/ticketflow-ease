import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import EventCard from '@/components/EventCard';
import Footer from '@/components/Footer';
import ProducerSolutionsSection from '@/components/home/ProducerSolutionsSection';
import { usePublicEvents } from '@/hooks/useEvents';
import { EventCategory, EventData } from '@/data/mockEvents';
import { Loader2 } from 'lucide-react';
import HomeHeroBanner from '@/components/home/HomeHeroBanner';

const Index = () => {
  const { data: dbEvents, isLoading } = usePublicEvents();

  const events: EventData[] = useMemo(() => {
    if (!dbEvents) return [];

    return dbEvents.map((event) => {
      const lots = event.event_lots || [];
      const activeLots = lots.filter((lot: any) => lot.is_active);
      const prices = activeLots.map((lot: any) => lot.price);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
      const totalTickets = lots.reduce((acc: number, lot: any) => acc + lot.total_quantity, 0);
      const soldTickets = lots.reduce((acc: number, lot: any) => acc + lot.sold_quantity, 0);
      const reservedTickets = lots.reduce((acc: number, lot: any) => acc + (lot.reserved_quantity || 0), 0);

      return {
        id: event.id,
        title: event.title,
        description: event.description || '',
        shortDescription: event.short_description || '',
        date: event.date,
        time: event.time,
        venue: event.venue,
        city: event.city,
        state: event.state,
        address: event.address || '',
        category: event.category as EventCategory,
        imageUrl: event.image_url || 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
        minPrice,
        maxPrice,
        totalTickets,
        soldTickets,
        isHot: event.is_hot || false,
        organizer: 'Produtor',
        lots: lots.map((lot: any) => ({
          id: lot.id,
          name: lot.name,
          price: lot.price,
          originalPrice: lot.original_price,
          available: lot.total_quantity - lot.sold_quantity - (lot.reserved_quantity || 0),
          total: lot.total_quantity,
          startDate: '',
          endDate: '',
        })),
      };
    });
  }, [dbEvents]);

  return (
    <>
      <Helmet>
        <title>FestPag - Compre Ingressos para Eventos</title>
        <meta
          name="description"
          content="A plataforma completa para comprar ingressos para festas, shows, festivais e eventos. Pagamento rápido e seguro!"
        />
        <meta property="og:title" content="FestPag - Compre Ingressos para Eventos" />
        <meta property="og:description" content="A plataforma completa para comprar ingressos para festas, shows, festivais e eventos. Pagamento rápido e seguro!" />
        <meta property="og:url" content="https://festpag.com.br/" />
        <meta name="twitter:title" content="FestPag - Compre Ingressos para Eventos" />
        <meta name="twitter:description" content="A plataforma completa para comprar ingressos para festas, shows, festivais e eventos. Pagamento rápido e seguro!" />
        <link rel="canonical" href="https://festpag.com.br/" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-20">
          {/* Hero Banner */}
          <HomeHeroBanner />

          <section id="eventos" className="scroll-mt-24 py-12">
            <div className="container px-4">
              <div className="text-center mb-10">
                <h2 className="font-display font-bold text-3xl md:text-4xl mb-3">
                  Próximos <span className="gradient-text">Eventos</span>
                </h2>
                <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
                  Não perca os melhores eventos da região
                </p>
              </div>

              {isLoading ? (
                <div className="flex justify-center items-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : events.length === 0 ? (
                <div className="text-center py-16 rounded-3xl border border-border/40 bg-card/30 backdrop-blur-sm">
                  <p className="text-muted-foreground text-base md:text-lg">
                    ​
                  </p>
                  <p className="text-muted-foreground/70 text-sm mt-2">
                    ​
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {events.map((event, index) => (
                    <EventCard key={event.id} event={event} index={index} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Seção de soluções para produtores */}
          <ProducerSolutionsSection variant="home" />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
