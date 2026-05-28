import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Clock,
  MapPin,
  Heart,
  Ticket,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useEvent } from '@/hooks/useEvents';
import { useEventLots } from '@/hooks/useEventLots';
import { useEventSeatAvailability } from '@/hooks/useEventSeatAvailability';
import { CheckoutModal } from '@/components/checkout/CheckoutModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { trackPageView, trackViewContent, trackInitiateCheckout } from '@/lib/metaPixel';
import festpagLogo from '@/assets/logo-festpag.png';
import { LotCard } from '@/components/event/LotCard';
import { PriceAndShareBar } from '@/components/event/PriceAndShareBar';
import { MesaReservaCTA } from '@/components/event/MesaReservaCTA';
import { EventPolicies } from '@/components/event/EventPolicies';

const getAnonymousId = () => {
  let id = localStorage.getItem('anonymous_like_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('anonymous_like_id', id);
  }
  return id;
};

const EventDetails = () => {
  const { id: slugOrId } = useParams<{ id: string }>();
  const { data: event, isLoading: eventLoading } = useEvent(slugOrId);
  const eventId: string | undefined = (event as any)?.id;
  const { lots, isLoading: lotsLoading } = useEventLots(eventId);
  const [selectedLots, setSelectedLots] = useState<Record<string, number>>({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const { user } = useAuth();

  const hasMap =
    !!event &&
    event.status === 'published' &&
    (event.event_type === 'mesa' || event.event_type === 'hibrido') &&
    !!event.table_map_id;

  const { data: seatSectors } = useEventSeatAvailability(hasMap ? eventId : undefined);

  useEffect(() => {
    if (!eventId) return;
    const anonymousId = getAnonymousId();

    const fetchLikes = async () => {
      const { count } = await supabase
        .from('event_likes' as any)
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId);
      setLikeCount(count || 0);

      const { data } = await supabase
        .from('event_likes' as any)
        .select('id')
        .eq('event_id', eventId)
        .eq('anonymous_id', anonymousId)
        .maybeSingle();
      setLiked(!!data);
    };
    fetchLikes();
  }, [eventId]);

  const handleLike = useCallback(async () => {
    if (!eventId) return;
    const anonymousId = getAnonymousId();

    if (liked) {
      setLiked(false);
      setLikeCount((prev) => Math.max(0, prev - 1));
      await supabase
        .from('event_likes' as any)
        .delete()
        .eq('event_id', eventId)
        .eq('anonymous_id', anonymousId);
    } else {
      setLiked(true);
      setLikeCount((prev) => prev + 1);
      await supabase
        .from('event_likes' as any)
        .insert({ event_id: eventId, anonymous_id: anonymousId } as any);
    }
  }, [eventId, liked]);

  const pixelId: string | null =
    (event as any)?.producer_profiles?.tracking_enabled
      ? (event as any)?.producer_profiles?.meta_pixel_id || null
      : null;

  useEffect(() => {
    if (!pixelId || !event) return;
    trackPageView(pixelId);
    trackViewContent(pixelId, {
      content_ids: [event.id],
      content_name: event.title,
      content_type: 'product',
      currency: 'BRL',
    });
  }, [pixelId, event?.id]);

  const isLoading = eventLoading || lotsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display font-bold text-2xl mb-4">Evento não encontrado</h1>
          <Link to="/" className="text-primary hover:underline">
            Voltar para a página inicial
          </Link>
        </div>
      </div>
    );
  }

  const getEventEnd = () => {
    if (event.end_date) {
      const t = event.end_time ? event.end_time.slice(0, 8) : '23:59:00';
      return new Date(`${event.end_date}T${t}`);
    }
    const st = event.time ? event.time.slice(0, 8) : '00:00:00';
    return new Date(new Date(`${event.date}T${st}`).getTime() + 6 * 60 * 60 * 1000);
  };
  const isEventFinished = event.status === 'finished' || getEventEnd() < new Date();
  const activeLots = isEventFinished ? [] : lots?.filter((lot) => lot.is_active) || [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatPrice = (price: number) =>
    price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleQuantityChange = (lotId: string, delta: number) => {
    setSelectedLots((prev) => {
      const current = prev[lotId] || 0;
      const newValue = Math.max(0, Math.min(10, current + delta));
      if (newValue === 0) {
        const { [lotId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [lotId]: newValue };
    });
  };

  const totalAmount = Object.entries(selectedLots).reduce((total, [lotId, qty]) => {
    const lot = activeLots.find((l) => l.id === lotId);
    return total + (lot?.price || 0) * qty;
  }, 0);

  const totalTickets = Object.values(selectedLots).reduce((sum, qty) => sum + qty, 0);

  // Compute "from price" combining lots + (if mesa) cheapest seat type
  const lotsFromPrice = activeLots.length
    ? Math.min(...activeLots.map((l) => l.price))
    : null;
  const seatsFromPrice = (seatSectors ?? [])
    .filter((s) => s.basePrice > 0)
    .reduce<number | null>(
      (min, s) => (min === null ? s.basePrice : Math.min(min, s.basePrice)),
      null,
    );
  const fromPrice = [lotsFromPrice, seatsFromPrice]
    .filter((v): v is number => v !== null && v > 0)
    .reduce<number | null>((min, v) => (min === null ? v : Math.min(min, v)), null);

  const fireInitiateCheckout = () => {
    if (!pixelId) return;
    trackInitiateCheckout(pixelId, {
      content_ids: Object.keys(selectedLots),
      content_name: event.title,
      num_items: totalTickets,
      value: totalAmount,
      currency: 'BRL',
    });
  };

  const handleCheckout = () => {
    if (totalTickets === 0) {
      toast.error('Selecione pelo menos um ingresso');
      return;
    }
    if (!user) {
      setIsAuthModalOpen(true);
    } else {
      fireInitiateCheckout();
      setIsCheckoutOpen(true);
    }
  };

  const handleAuthenticated = () => {
    setIsAuthModalOpen(false);
    fireInitiateCheckout();
    setIsCheckoutOpen(true);
  };

  const cartItems = Object.entries(selectedLots).map(([lotId, quantity]) => {
    const lot = activeLots.find((l) => l.id === lotId);
    return {
      lotId,
      lotName: lot?.name || '',
      quantity,
      price: lot?.price || 0,
    };
  });

  // Group lots by sector
  const lotGroups = (() => {
    const groups = new Map<string, typeof activeLots>();
    for (const lot of activeLots) {
      const key = lot.sector_name?.trim() || 'Ingresso';
      if (!groups.has(key)) groups.set(key, [] as typeof activeLots);
      groups.get(key)!.push(lot);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Ingresso') return -1;
      if (b === 'Ingresso') return 1;
      return 0;
    });
  })();

  const canonicalUrl = `https://festpag.com.br/evento/${event.slug ?? event.id}`;

  return (
    <>
      <Helmet>
        <title>{event.title} - FestPag</title>
        <meta
          name="description"
          content={event.short_description || event.description || ''}
        />
        <meta property="og:title" content={`${event.title} - FestPag`} />
        <meta
          property="og:description"
          content={
            event.short_description ||
            event.description ||
            `Garanta seu ingresso para ${event.title} em ${event.city}.`
          }
        />
        <meta property="og:type" content="event" />
        <meta property="og:url" content={canonicalUrl} />
        {event.image_url && <meta property="og:image" content={event.image_url} />}
        <meta name="twitter:title" content={`${event.title} - FestPag`} />
        <meta
          name="twitter:description"
          content={
            event.short_description ||
            event.description ||
            `Garanta seu ingresso para ${event.title} em ${event.city}.`
          }
        />
        {event.image_url && <meta name="twitter:image" content={event.image_url} />}
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main className={cn('pt-20 w-full', totalTickets > 0 && 'pb-28')}>
          {isEventFinished && (
            <div className="w-full bg-destructive/10 border-b border-destructive/20">
              <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-center gap-2">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <span className="font-semibold text-destructive">Evento Encerrado</span>
              </div>
            </div>
          )}

          {/* Banner full-width */}
          <section className="relative w-full max-w-5xl mx-auto px-4 pt-4">
            <div className="relative rounded-2xl overflow-hidden shadow-xl shadow-primary/10">
              <div className="aspect-[4/5] sm:aspect-[16/9] bg-muted">
                <img
                  src={event.image_url || '/placeholder.svg'}
                  alt={event.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                onClick={handleLike}
                className="absolute bottom-4 right-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full px-3 py-2 transition-colors hover:bg-black/80"
                aria-label="Curtir evento"
              >
                <Heart
                  className={cn(
                    'w-5 h-5 transition-colors',
                    liked ? 'fill-red-500 text-red-500' : 'text-white',
                  )}
                />
                {likeCount > 0 && (
                  <span
                    className={cn(
                      'text-sm font-medium',
                      liked ? 'text-red-500' : 'text-white',
                    )}
                  >
                    {likeCount}
                  </span>
                )}
              </button>
            </div>
          </section>

          {/* Linear content */}
          <section className="w-full max-w-3xl mx-auto px-4 py-6 space-y-6 min-w-0">
            {/* Title + meta */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <h1 className="font-display font-bold text-3xl md:text-4xl break-words">
                {event.title}
              </h1>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span className="text-sm capitalize">{formatDate(event.date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{event.time}</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-foreground font-semibold text-lg break-words">
                  {event.venue}
                </p>
                <p className="text-sm text-muted-foreground">
                  {event.city}, {event.state}
                </p>
                {event.address && (
                  <div className="flex items-start gap-2 text-muted-foreground min-w-0 pt-1">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                    <span className="text-sm break-words">{event.address}</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Price + share */}
            {!isEventFinished && (
              <PriceAndShareBar
                fromPrice={fromPrice}
                shareTitle={event.title}
                shareText={event.short_description || undefined}
              />
            )}

            {/* Reserve sua Mesa (mesa | hibrido) */}
            {!isEventFinished && hasMap && eventId && (
              <MesaReservaCTA eventId={eventId} eventSlugOrId={event.slug ?? event.id} />
            )}

            {/* Ingressos */}
            {activeLots.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="space-y-4"
              >
                <h2 className="font-display font-bold text-xl">Ingressos</h2>
                {lotGroups.map(([sectorName, sectorLots]) => (
                  <div
                    key={sectorName}
                    className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl overflow-hidden shadow-lg shadow-primary/5"
                  >
                    <div className="px-5 md:px-6 py-4 bg-gradient-to-r from-primary/15 via-primary/10 to-accent/10 border-b border-border/40">
                      <h3 className="font-display font-bold text-sm uppercase tracking-[0.2em] text-primary">
                        {sectorName}
                      </h3>
                    </div>
                    <div className="divide-y divide-border/40">
                      {sectorLots.map((lot) => (
                        <LotCard
                          key={lot.id}
                          lot={lot}
                          quantity={selectedLots[lot.id] || 0}
                          onQuantityChange={(delta) => handleQuantityChange(lot.id, delta)}
                          formatPrice={formatPrice}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Sobre */}
            {(event.description || event.short_description) && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="py-2"
              >
                <h3 className="font-display font-bold text-xl mb-4">Sobre o evento</h3>
                <div className="text-muted-foreground leading-relaxed space-y-4">
                  {(event.description || event.short_description || '')
                    .split(/\n{2,}/)
                    .map((para: string, i: number) => (
                      <p key={i} className="whitespace-pre-wrap break-words">
                        {para}
                      </p>
                    ))}
                </div>
              </motion.section>
            )}

            {/* Realização */}
            {(() => {
              const producer = (event as any).producer_profiles;
              const brandName = producer?.brand_name;
              const logoUrl = producer?.logo_url || festpagLogo;
              if (!brandName) return null;
              return (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="py-2"
                >
                  <h3 className="font-display font-bold text-xl mb-4">Realização</h3>
                  <div className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card">
                    <div className="h-14 w-14 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      <img src={logoUrl} alt={brandName} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{brandName}</p>
                      <p className="text-sm text-muted-foreground">Produtora do evento</p>
                    </div>
                  </div>
                </motion.section>
              );
            })()}

            {/* Políticas */}
            <EventPolicies />
          </section>
        </main>

        <Footer />

        {/* Sticky bottom bar (mobile + desktop) when lots selected */}
        <AnimatePresence>
          {totalTickets > 0 && (
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border px-4 py-3"
            >
              <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {totalTickets} ingresso{totalTickets > 1 ? 's' : ''}
                  </p>
                  <p className="font-bold text-lg gradient-text">
                    {formatPrice(totalAmount)}
                  </p>
                </div>
                <Button
                  variant="hero"
                  size="lg"
                  onClick={handleCheckout}
                  className="shrink-0"
                >
                  <Ticket className="w-5 h-5 mr-2" />
                  Comprar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onAuthenticated={handleAuthenticated}
        />

        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          eventId={eventId || ''}
          eventTitle={event.title}
          eventDate={event.date}
          eventTime={event.time}
          eventVenue={event.venue}
          items={cartItems}
          totalAmount={totalAmount}
        />
      </div>
    </>
  );
};

export default EventDetails;
