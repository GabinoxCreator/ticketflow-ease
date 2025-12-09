import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import CategoryFilter from '@/components/CategoryFilter';
import EventGrid from '@/components/EventGrid';
import Footer from '@/components/Footer';
import { mockEvents, EventCategory } from '@/data/mockEvents';

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);

  const filteredEvents = useMemo(() => {
    if (!selectedCategory) return mockEvents;
    return mockEvents.filter((event) => event.category === selectedCategory);
  }, [selectedCategory]);

  const hotEvents = useMemo(() => {
    return mockEvents.filter((event) => event.isHot).slice(0, 3);
  }, []);

  return (
    <>
      <Helmet>
        <title>IngressosRP - Compre Ingressos para Eventos em Ribeirão Preto</title>
        <meta
          name="description"
          content="A plataforma mais simples para comprar ingressos para festas, shows, festivais e teatro em Ribeirão Preto. Receba seus ingressos direto no WhatsApp!"
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
          <EventGrid
            events={filteredEvents}
            title={selectedCategory ? undefined : 'Próximos Eventos'}
            subtitle={selectedCategory ? undefined : 'Não perca os melhores eventos da região'}
          />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
