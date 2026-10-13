import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import EventCard from '@/components/EventCard';
import Footer from '@/components/Footer';
import ProducerSolutionsSection from '@/components/home/ProducerSolutionsSection';
import { usePublicEvents } from '@/hooks/useEvents';
import { EventData } from '@/data/mockEvents';
import { Loader2 } from 'lucide-react';
import { VitrineDeCategorias } from '@/components/home/VitrineDeCategorias';
import { nomeDaCategoria } from '@/lib/categorias-de-evento';
import { CarrosselDeBanners } from '@/components/home/CarrosselDeBanners';
import { eventoParaCard } from '@/lib/evento-para-card';

const Index = () => {
  const { data: dbEvents, isLoading } = usePublicEvents();

  // A montagem do cartão mora em lib/evento-para-card (a página do produtor usa a mesma).
  const events: EventData[] = useMemo(() => (dbEvents ? dbEvents.map(eventoParaCard) : []), [dbEvents]);

  // Filtro da barra de categorias (23/09/2026). Fica só na tela: os eventos já
  // estão na memória, então trocar de categoria não vai ao servidor.
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(null);
  const eventosNaTela = useMemo(
    () => (categoriaSelecionada ? events.filter((e) => e.category === categoriaSelecionada) : events),
    [events, categoriaSelecionada],
  );

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
        <meta property="og:url" content="https://festpag.digital/" />
        <meta name="twitter:title" content="FestPag - Compre Ingressos para Eventos" />
        <meta name="twitter:description" content="A plataforma completa para comprar ingressos para festas, shows, festivais e eventos. Pagamento rápido e seguro!" />
        <link rel="canonical" href="https://festpag.digital/" />
      </Helmet>

      <div className="min-h-screen">
        <Header />
        <main className="pt-20">
          {/* Hero Banner */}
            {/* O carrossel vira o primeiro bloco da página (pedido do Gabriel,
            * 24/09 — referência: a home da Sympla). A frase institucional
            * continua, agora abaixo e em corpo menor, para não competir com a
            * arte dos eventos. */}
          <CarrosselDeBanners
            eventos={events.slice(0, 6).map((e) => ({
              id: e.id,
              slug: e.slug,
              title: e.title,
              imageUrl: e.imageUrl,
            }))}
          />

          {/* A frase institucional com os dois botões saiu em 24/09, a pedido do
            * Gabriel ("pode sair agora, não precisa mais ficar isso aqui"). O
            * componente HomeHeroBanner segue no repositório, sem uso, caso ele
            * mude de ideia. */}

          <VitrineDeCategorias
            selecionada={categoriaSelecionada}
            aoSelecionar={setCategoriaSelecionada}
          />

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
              ) : eventosNaTela.length === 0 ? (
                <div className="text-center py-16 rounded-3xl border border-border/40 bg-card/30 backdrop-blur-sm">
                  {/* Com categoria escolhida, a tela EXPLICA o vazio. Sem filtro,
                    * fica como sempre foi — não é este o trabalho de mudar isso. */}
                  {categoriaSelecionada ? (
                    <>
                      <p className="text-muted-foreground text-base md:text-lg">
                        Ainda não temos evento em {nomeDaCategoria(categoriaSelecionada)}.
                      </p>
                      <button
                        type="button"
                        onClick={() => setCategoriaSelecionada(null)}
                        className="text-primary hover:underline text-sm mt-3 font-medium"
                      >
                        Ver todos os eventos
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground text-base md:text-lg">​</p>
                      <p className="text-muted-foreground/70 text-sm mt-2">​</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {eventosNaTela.map((event, index) => (
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
