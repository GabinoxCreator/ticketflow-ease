// Página própria do produtor: festpag.digital/<endereço-dele> (OS-219, 13/10/2026).
// Pedido do Guilherme para a Disgracera Cultural: um endereço com todos os
// eventos da produtora, como na Sympla. O endereço nasce do nome da produtora
// (gatilho no banco) e o produtor pode trocar nas Configurações.
//
// Desenho (pedido do Gabriel, 13/10: "tá bem crua, veja alguns exemplos";
// referência: a página de produtor da Sympla): capa, logo sobreposta, números
// da produtora, próximo evento em destaque, os outros à venda, "Sobre" e os
// que já aconteceram. Capa, "Sobre" e Instagram o produtor preenche nas
// Configurações; sem capa, a arte do próximo evento vira o fundo.
//
// A rota é `/:slugProdutor`, a última antes do 404: as rotas do site (login,
// evento, ajuda...) ganham dela, e o banco não deixa produtor ficar com essas
// palavras. Endereço que não é de ninguém cai no 404 de sempre.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarDays, CalendarCheck, Instagram, Loader2, MapPin, Share2, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import EventCard from '@/components/EventCard';
import { Button } from '@/components/ui/button';
import NotFound from '@/pages/NotFound';
import { supabasePublic } from '@/integrations/supabase/publicClient';
import { usePublicEventsDoProdutor } from '@/hooks/useEvents';
import { eventoParaCard } from '@/lib/evento-para-card';
import { formatEventDate, horaCurta } from '@/lib/eventTime';
import type { EventData } from '@/data/mockEvents';

interface ProdutorPublico {
  id: string;
  brand_name: string;
  logo_url: string | null;
  slug: string;
  pagina_capa_url: string | null;
  pagina_sobre: string | null;
  pagina_instagram: string | null;
}

function useProdutorPublico(slug: string | undefined) {
  return useQuery({
    queryKey: ['produtor-publico', slug],
    enabled: !!slug,
    queryFn: async (): Promise<ProdutorPublico | null> => {
      // A tabela da produtora é fechada para visitante (tem documento, e-mail,
      // telefone). A função devolve só o que é público.
      const { data, error } = await supabasePublic.rpc('produtor_publico' as any, { _slug: slug } as any);
      if (error) throw error;
      const linha = Array.isArray(data) ? data[0] : null;
      return (linha as ProdutorPublico) ?? null;
    },
  });
}

// "FILHOS DA LUZ EDICOES E PRODUCOES LTDA" vira "FL": as duas primeiras palavras que contam.
const PALAVRAS_SEM_INICIAL = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'a', 'o']);
function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter((p) => !PALAVRAS_SEM_INICIAL.has(p.toLowerCase()));
  return palavras.slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

const preco = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

async function compartilhar(titulo: string, url: string) {
  try {
    if (navigator.share) {
      await navigator.share({ title: titulo, url });
      return;
    }
  } catch {
    return; // a pessoa fechou o menu de compartilhar
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  } catch {
    toast.error('Não deu para copiar. O endereço é ' + url);
  }
}

/** O próximo evento, grande, com o botão de comprar. */
function ProximoEvento({ evento }: { evento: EventData }) {
  const [imgFalhou, setImgFalhou] = useState(false);
  const dia = formatEventDate(evento.date, { day: '2-digit' });
  const mes = formatEventDate(evento.date, { month: 'short' }).replace('.', '');
  const semana = formatEventDate(evento.date, { weekday: 'long' });
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Link
        to={`/evento/${evento.slug ?? evento.id}`}
        className="group grid md:grid-cols-[1.35fr_1fr] overflow-hidden rounded-3xl border border-border bg-card hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 transition-all"
      >
        <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[320px] overflow-hidden bg-muted">
          {evento.imageUrl && !imgFalhou ? (
            <img
              src={evento.imageUrl}
              alt={evento.title}
              onError={() => setImgFalhou(true)}
              className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-primary/10 to-accent/30 flex items-center justify-center">
              <CalendarDays className="w-14 h-14 text-primary/60" />
            </div>
          )}
          <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-lg">
            <Ticket className="h-3.5 w-3.5" /> Próximo evento
          </span>
        </div>
        <div className="flex flex-col gap-4 p-6 md:p-8">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <span className="font-display text-2xl font-bold leading-none">{dia}</span>
              <span className="text-xs font-semibold uppercase">{mes}</span>
            </div>
            <p className="text-sm capitalize text-muted-foreground">
              {semana}
              {evento.time && <> · {horaCurta(evento.time)}</>}
            </p>
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-bold leading-tight break-words">{evento.title}</h2>
          <p className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {evento.venue}
              {evento.city && <> · {evento.city}{evento.state ? `/${evento.state}` : ''}</>}
            </span>
          </p>
          <div className="mt-auto flex items-end justify-between gap-4 pt-2">
            {evento.minPrice > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">A partir de</p>
                <p className="font-display text-2xl font-bold text-primary">{preco(evento.minPrice)}</p>
              </div>
            ) : (
              <span />
            )}
            <span className="inline-flex h-11 items-center whitespace-nowrap rounded-xl bg-primary px-4 sm:px-5 text-sm font-semibold text-primary-foreground shadow-md group-hover:bg-primary/90 transition-colors">
              Comprar ingresso
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

type EventoPassado = {
  id: string;
  slug?: string | null;
  title: string;
  date: string;
  venue: string;
  city: string;
  state: string;
  image_url: string | null;
};

/** Cartão pequeno de evento que já aconteceu: mostra a história da produtora. */
function CartaoPassado({ evento }: { evento: EventoPassado }) {
  const [imgFalhou, setImgFalhou] = useState(false);
  return (
    <Link
      to={`/evento/${evento.slug ?? evento.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {evento.image_url && !imgFalhou ? (
          <img
            src={evento.image_url}
            alt={evento.title}
            loading="lazy"
            onError={() => setImgFalhou(true)}
            className="h-full w-full object-cover grayscale-[60%] group-hover:grayscale-0 transition-all duration-500"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-muted to-primary/10 flex items-center justify-center">
            <CalendarCheck className="h-8 w-8 text-muted-foreground/60" />
          </div>
        )}
        <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          Realizado
        </span>
      </div>
      <div className="p-3">
        <p className="text-xs font-medium text-primary">{formatEventDate(evento.date, { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug">{evento.title}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{evento.city}{evento.state ? `/${evento.state}` : ''}</p>
      </div>
    </Link>
  );
}

export default function ProdutorPublicoPage() {
  const { slugProdutor } = useParams<{ slugProdutor: string }>();
  const slug = (slugProdutor || '').toLowerCase();
  const { data: produtor, isLoading: carregandoProdutor, isError } = useProdutorPublico(slug);
  const { data: eventos, isLoading: carregandoEventos } = usePublicEventsDoProdutor(produtor?.id);
  const aVenda = useMemo(() => (eventos?.aVenda ?? []).map(eventoParaCard), [eventos]);
  const passados = (eventos?.passados ?? []) as EventoPassado[];
  const totalRealizados = eventos?.totalRealizados ?? 0;
  const [logoFalhou, setLogoFalhou] = useState(false);

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
  const descricao = produtor.pagina_sobre?.trim()
    ? produtor.pagina_sobre.trim().slice(0, 155)
    : `Todos os eventos de ${produtor.brand_name} com ingresso à venda na FestPag.`;
  const logo = produtor.logo_url && !logoFalhou ? produtor.logo_url : null;
  const [proximo, ...outros] = aVenda;
  // Capa: a que o produtor escolheu; sem ela, a arte do próximo evento (ou do último
  // realizado) desfocada ao fundo; sem nenhuma, o degradê da marca.
  const capaPropria = produtor.pagina_capa_url || null;
  const capaAuto = capaPropria ? null : proximo?.imageUrl || passados.find((p) => p.image_url)?.image_url || null;
  const instagram = produtor.pagina_instagram?.trim() || null;

  return (
    <>
      <Helmet>
        <title>{titulo}</title>
        <meta name="description" content={descricao} />
        <meta property="og:title" content={titulo} />
        <meta property="og:description" content={descricao} />
        <meta property="og:url" content={endereco} />
        {(capaPropria || capaAuto || produtor.logo_url) && (
          <meta property="og:image" content={(capaPropria || capaAuto || produtor.logo_url) as string} />
        )}
        <meta name="twitter:title" content={titulo} />
        <meta name="twitter:description" content={descricao} />
        <link rel="canonical" href={endereco} />
      </Helmet>

      <div className="min-h-screen">
        <Header />
        <main className="pt-20">
          {/* Capa */}
          <section className="container px-4 pt-4">
            <div className="relative h-40 sm:h-56 md:h-72 overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/70 to-pink-500">
              {capaPropria && (
                <img src={capaPropria} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {capaAuto && (
                <>
                  <img src={capaAuto} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl opacity-90" />
                  {/* Celular: a arte inteira no meio. Computador: a arte à direita, saindo do fundo. */}
                  <img src={capaAuto} alt="" aria-hidden className="absolute inset-0 m-auto h-full w-auto max-w-full object-contain md:hidden" />
                  <img src={capaAuto} alt="" aria-hidden className="absolute inset-y-0 right-0 hidden md:block h-full w-1/2 object-cover [mask-image:linear-gradient(to_right,transparent,black_35%)]" />
                </>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>

            {/* Identidade */}
            {/* Só a logo sobe sobre a capa; o nome fica abaixo dela, sempre legível. */}
            <div className="relative flex flex-col items-center gap-4 px-2 text-center sm:flex-row sm:items-start sm:gap-6 sm:px-8 sm:text-left">
              <div className="-mt-12 sm:-mt-16 h-24 w-24 sm:h-32 sm:w-32 shrink-0 overflow-hidden rounded-full border-4 border-background bg-muted shadow-xl">
                {logo ? (
                  <img src={logo} alt={produtor.brand_name} onError={() => setLogoFalhou(true)} className="h-full w-full object-cover" />
                ) : (
                  // Sem logo: as iniciais da produtora, no degradê da marca.
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-pink-500 font-display text-3xl sm:text-4xl font-bold text-white">
                    {iniciais(produtor.brand_name)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 sm:pt-4">
                <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold leading-tight break-words">
                  {produtor.brand_name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  {!carregandoEventos && (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background px-3 py-1 text-xs font-semibold text-primary">
                        <Ticket className="h-3.5 w-3.5" />
                        {aVenda.length === 0 ? 'Nenhum evento à venda agora' : plural(aVenda.length, 'evento à venda', 'eventos à venda')}
                      </span>
                      {totalRealizados > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
                          <CalendarCheck className="h-3.5 w-3.5" />
                          {plural(totalRealizados, 'evento realizado', 'eventos realizados')}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-2 sm:pt-5">
                {instagram && (
                  <Button asChild variant="outline" className="rounded-xl">
                    <a href={`https://instagram.com/${instagram}`} target="_blank" rel="noreferrer">
                      <Instagram className="mr-1.5 h-4 w-4" /> @{instagram}
                    </a>
                  </Button>
                )}
                <Button variant="outline" className="rounded-xl" onClick={() => compartilhar(produtor.brand_name, endereco)}>
                  <Share2 className="mr-1.5 h-4 w-4" /> Compartilhar
                </Button>
              </div>
            </div>
          </section>

          {carregandoEventos ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* À venda */}
              <section className="container px-4 pt-10 md:pt-12">
                {proximo ? (
                  <ProximoEvento evento={proximo} />
                ) : (
                  <div className="text-center py-14 px-6 rounded-3xl border border-dashed border-border bg-card/40">
                    <CalendarDays className="mx-auto mb-3 h-10 w-10 text-primary/50" />
                    <p className="font-display text-lg font-semibold">Nenhum evento à venda agora</p>
                    <p className="text-muted-foreground text-sm mt-1">
                      Quando {produtor.brand_name} abrir a venda do próximo, ele aparece aqui.
                      {instagram && <> Enquanto isso, acompanhe no Instagram.</>}
                    </p>
                  </div>
                )}

                {outros.length > 0 && (
                  <div className="mt-12">
                    <h2 className="font-display text-xl md:text-2xl font-bold mb-5">
                      Mais eventos <span className="gradient-text">à venda</span>
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {outros.map((event, index) => (
                        <EventCard key={event.id} event={event} index={index} />
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Sobre */}
              {produtor.pagina_sobre?.trim() && (
                <section className="container px-4 pt-12">
                  <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
                    <h2 className="font-display text-xl md:text-2xl font-bold mb-3">Sobre</h2>
                    <div className="space-y-3 text-muted-foreground leading-relaxed">
                      {produtor.pagina_sobre.trim().split(/\n{2,}/).map((para, i) => (
                        <p key={i} className="whitespace-pre-wrap break-words">{para}</p>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Já aconteceram */}
              {passados.length > 0 && (
                <section className="container px-4 pt-12">
                  <h2 className="font-display text-xl md:text-2xl font-bold mb-5">Já aconteceram</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {passados.map((e) => (
                      <CartaoPassado key={e.id} evento={e} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Para quem produz */}
          <section className="container px-4 py-14">
            <div className="flex flex-col items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-primary/10 via-background to-pink-500/10 border border-border/60 p-6 text-center sm:flex-row sm:text-left">
              <div>
                <p className="font-display font-semibold">Você também produz eventos?</p>
                <p className="text-sm text-muted-foreground">Venda seus ingressos na FestPag e ganhe uma página como esta.</p>
              </div>
              <Button asChild className="rounded-xl shrink-0">
                <Link to="/area-do-produtor">Quero vender</Link>
              </Button>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
