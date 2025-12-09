import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import CategoryFilter from '@/components/CategoryFilter';
import EventGrid from '@/components/EventGrid';
import Footer from '@/components/Footer';
import { usePublicEvents } from '@/hooks/useEvents';
import { EventCategory, EventData } from '@/data/mockEvents';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);
  const { data: dbEvents, isLoading } = usePublicEvents();

  // Transform database events to the format expected by EventGrid
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
          available: lot.total_quantity - lot.sold_quantity,
          total: lot.total_quantity,
          startDate: '',
          endDate: '',
        })),
      };
    });
  }, [dbEvents]);

  const filteredEvents = useMemo(() => {
    if (!selectedCategory) return events;
    return events.filter((event) => event.category === selectedCategory);
  }, [selectedCategory, events]);

  return (
    <>
      <Helmet>
        <title>IngressosRP - Compre Ingressos para Eventos em Rio Preto</title>
        <meta
          name="description"
          content="A plataforma mais simples para comprar ingressos para festas, shows, festivais e teatro em Rio Preto. Receba seus ingressos direto no WhatsApp!"
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />
        <main>
          <Hero />
          <CategoryFilter
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground text-lg">
                Nenhum evento disponível no momento.
              </p>
            </div>
          ) : (
            <EventGrid
              events={filteredEvents}
              title={selectedCategory ? undefined : 'Próximos Eventos'}
              subtitle={selectedCategory ? undefined : 'Não perca os melhores eventos da região'}
            />
          )}
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
