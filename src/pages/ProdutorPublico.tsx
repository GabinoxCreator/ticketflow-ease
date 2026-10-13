// Página própria do produtor: festpag.digital/<endereço-dele> (OS-219, 13/10/2026).
// Pedido do Guilherme para a Disgracera Cultural: um endereço com todos os
// eventos da produtora, como na Sympla. O endereço nasce do nome da produtora
// (gatilho no banco) e o produtor pode trocar nas Configurações.
//
// A rota é `/:slugProdutor`, a última antes do 404: as rotas do site (login,
// evento, ajuda...) ganham dela, e o banco não deixa produtor ficar com essas
// palavras. Endereço que não é de ninguém cai no 404 de sempre.
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import EventCard from '@/components/EventCard';
import NotFound from '@/pages/NotFound';
import { supabasePublic } from '@/integrations/supabase/publicClient';
import { usePublicEventsDoProdutor } from '@/hooks/useEvents';
import { eventoParaCard } from '@/lib/evento-para-card';
import festpagLogo from '@/assets/logo-festpag.png';

interface ProdutorPublico {
  id: string;
  brand_name: string;
  logo_url: string | null;
  slug: string;
}

function useProdutorPublico(slug: string | undefined) {
  return useQuery({
    queryKey: ['produtor-publico', slug],
    enabled: !!slug,
    queryFn: async (): Promise<ProdutorPublico | null> => {
      // A tabela da produtora é fechada para visitante (tem documento, e-mail,
      // telefone). A função devolve só nome e logo, o que já aparece em "Realização".
      const { data, error } = await supabasePublic.rpc('produtor_publico' as any, { _slug: slug } as any);
      if (error) throw error;
      const linha = Array.isArray(data) ? data[0] : null;
      return (linha as ProdutorPublico) ?? null;
    },
  });
}

export default function ProdutorPublicoPage() {
  const { slugProdutor } = useParams<{ slugProdutor: string }>();
  const slug = (slugProdutor || '').toLowerCase();
  const { data: produtor, isLoading: carregandoProdutor, isError } = useProdutorPublico(slug);
  const { data: dbEvents, isLoading: carregandoEventos } = usePublicEventsDoProdutor(produtor?.id);
  const eventos = useMemo(() => (dbEvents ? dbEvents.map(eventoParaCard) : []), [dbEvents]);

  if (carregandoProdutor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!produtor || isError) return <NotFound />;

  const endereco = `https://festpag.digital/${produtor.slug}`;
  const titulo = `${produtor.brand_name} | Ingressos na FestPag`;
  const descricao = `Todos os eventos de ${produtor.brand_name} com ingresso à venda na FestPag.`;
  const logo = produtor.logo_url || festpagLogo;

  return (
    <>
      <Helmet>
        <title>{titulo}</title>
        <meta name="description" content={descricao} />
        <meta property="og:title" content={titulo} />
        <meta property="og:description" content={descricao} />
        <meta property="og:url" content={endereco} />
        {produtor.logo_url && <meta property="og:image" content={produtor.logo_url} />}
        <meta name="twitter:title" content={titulo} />
        <meta name="twitter:description" content={descricao} />
        <link rel="canonical" href={endereco} />
      </Helmet>

      <div className="min-h-screen">
        <Header />
        <main className="pt-20">
          <section className="border-b border-border/40 bg-gradient-to-br from-primary/10 via-background to-pink-500/10">
            <div className="container px-4 py-10 md:py-14 flex flex-col sm:flex-row items-center gap-5 sm:gap-6 text-center sm:text-left">
              <div className="h-24 w-24 md:h-28 md:w-28 rounded-full overflow-hidden bg-muted border-2 border-primary/30 shadow-lg shrink-0">
                <img src={logo} alt={produtor.brand_name} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                  Produtora
                </p>
                <h1 className="font-display font-bold text-3xl md:text-4xl break-words">
                  {produtor.brand_name}
                </h1>
                {!carregandoEventos && (
                  <p className="text-muted-foreground mt-2">
                    {eventos.length === 0
                      ? 'Nenhum evento à venda agora'
                      : eventos.length === 1
                        ? '1 evento à venda'
                        : `${eventos.length} eventos à venda`}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="py-10 md:py-12">
            <div className="container px-4">
              {carregandoEventos ? (
                <div className="flex justify-center items-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : eventos.length === 0 ? (
                <div className="text-center py-16 rounded-3xl border border-border/40 bg-card/30 backdrop-blur-sm">
                  <p className="text-muted-foreground text-base md:text-lg">
                    {produtor.brand_name} não tem evento à venda agora.
                  </p>
                  <p className="text-muted-foreground/70 text-sm mt-2">
                    Quando abrir a venda do próximo, ele aparece aqui.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {eventos.map((event, index) => (
                    <EventCard key={event.id} event={event} index={index} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
