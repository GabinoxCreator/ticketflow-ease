import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Clock,
  MapPin,
  Heart,
  Minus,
  Plus,
  Ticket,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useEvent } from '@/hooks/useEvents';
import { useEventLots } from '@/hooks/useEventLots';
import { CheckoutModal } from '@/components/checkout/CheckoutModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { trackPageView, trackViewContent, trackInitiateCheckout } from '@/lib/metaPixel';
import festpagLogo from '@/assets/logo-festpag.png';
import EventDetailsSeated from './EventDetailsSeated';

const getAnonymousId = () => {
  let id = localStorage.getItem('anonymous_like_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('anonymous_like_id', id);
  }
  return id;
};

interface EventLot {
  id: string;
  name: string;
  price: number;
  original_price?: number | null;
  total_quantity: number;
  sold_quantity: number;
  reserved_quantity?: number;
  description?: string | null;
  is_active?: boolean | null;
  fake_scarcity_enabled?: boolean | null;
  fake_scarcity_percentage?: number | null;
  sector_name?: string | null;
}

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
      setLikeCount(prev => Math.max(0, prev - 1));
      await supabase
        .from('event_likes' as any)
        .delete()
        .eq('event_id', eventId)
        .eq('anonymous_id', anonymousId);
    } else {
      setLiked(true);
      setLikeCount(prev => prev + 1);
      await supabase
        .from('event_likes' as any)
        .insert({ event_id: eventId, anonymous_id: anonymousId } as any);
    }
  }, [eventId, liked]);

  const pixelId: string | null =
    (event as any)?.producer_profiles?.tracking_enabled
      ? ((event as any)?.producer_profiles?.meta_pixel_id || null)
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
    if (!event) return new Date(0);
    if (event.end_date) {
      const t = event.end_time ? event.end_time.slice(0, 8) : '23:59:00';
      return new Date(`${event.end_date}T${t}`);
    }
    const st = event.time ? event.time.slice(0, 8) : '00:00:00';
    return new Date(new Date(`${event.date}T${st}`).getTime() + 6 * 60 * 60 * 1000);
  };
  const isEventFinished = event ? (event.status === 'finished' || getEventEnd() < new Date()) : false;
  const activeLots = isEventFinished ? [] : (lots?.filter(lot => lot.is_active) || []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

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


  const fireInitiateCheckout = () => {
    if (!pixelId) return;
    trackInitiateCheckout(pixelId, {
      content_ids: Object.keys(selectedLots),
      content_name: event?.title,
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

  return (
    <>
      <Helmet>
        <title>{event.title} - FestPag</title>
        <meta name="description" content={event.short_description || event.description || ''} />
        <meta property="og:title" content={`${event.title} - FestPag`} />
        <meta property="og:description" content={event.short_description || event.description || `Garanta seu ingresso para ${event.title} em ${event.city}.`} />
        <meta property="og:type" content="event" />
        <meta property="og:url" content={`https://festpag.com.br/evento/${event.slug ?? event.id}`} />
        {event.image_url && <meta property="og:image" content={event.image_url} />}
        <meta name="twitter:title" content={`${event.title} - FestPag`} />
        <meta name="twitter:description" content={event.short_description || event.description || `Garanta seu ingresso para ${event.title} em ${event.city}.`} />
        {event.image_url && <meta name="twitter:image" content={event.image_url} />}
        <link rel="canonical" href={`https://festpag.com.br/evento/${event.slug ?? event.id}`} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main className={cn("pt-20 w-full", totalTickets > 0 && "pb-24 lg:pb-0")}>
          {/* Evento Encerrado Banner */}
          {isEventFinished && (
            <div className="w-full bg-destructive/10 border-b border-destructive/20">
              <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-center gap-2">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <span className="font-semibold text-destructive">Evento Encerrado</span>
              </div>
            </div>
          )}

        {/* Desktop Hero Split */}
          <section className="relative overflow-hidden hidden lg:flex pt-8 w-full max-w-7xl mx-auto px-4 min-h-[50vh] items-center gap-12">
            {/* Blurred background */}
            <div className="absolute inset-0 -z-10">
              <img
                src={event.image_url || '/placeholder.svg'}
                alt=""
                className="w-full h-full object-cover scale-110 blur-3xl opacity-30"
              />
              <div className="absolute inset-0 bg-background/60" />
            </div>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 space-y-4"
            >
              <h1 className="font-display font-bold text-4xl xl:text-5xl">
                {event.title}
              </h1>
              <p className="text-muted-foreground text-lg">
                {event.city}, {event.state}
              </p>
              <p className="text-foreground font-semibold text-xl break-words">
                {event.venue}
              </p>
              {event.address && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="w-5 h-5 mt-0.5 shrink-0" />
                  <span className="break-words">{event.address}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-6 text-muted-foreground pt-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 shrink-0" />
                  <span>{formatDate(event.date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 shrink-0" />
                  <span>{event.time}</span>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 relative"
            >
              <div className="rounded-xl overflow-hidden">
                <img
                  src={event.image_url || '/placeholder.svg'}
                  alt={event.title}
                  className="w-full h-auto max-h-[50vh] object-cover"
                />
              </div>
              <button
                onClick={handleLike}
                className="absolute bottom-4 right-4 z-10 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-2 transition-colors hover:bg-black/70"
              >
                <Heart className={cn('w-5 h-5 transition-colors', liked ? 'fill-red-500 text-red-500' : 'text-white')} />
                {likeCount > 0 && (
                  <span className={cn('text-sm font-medium', liked ? 'text-red-500' : 'text-white')}>{likeCount}</span>
                )}
              </button>
            </motion.div>
          </section>

          {/* Mobile Banner */}
          <section className="lg:hidden relative overflow-x-clip bg-black max-w-full">
            <div className="w-full max-h-[50vh] md:max-h-[70vh] flex items-center justify-center overflow-hidden">
              <img
                src={event.image_url || '/placeholder.svg'}
                alt={event.title}
                className="w-full h-auto max-h-[50vh] md:max-h-[70vh] object-contain"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
            <button
              onClick={handleLike}
              className="absolute bottom-4 right-4 z-10 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-2 transition-colors hover:bg-black/70"
            >
              <Heart className={cn('w-5 h-5 transition-colors', liked ? 'fill-red-500 text-red-500' : 'text-white')} />
              {likeCount > 0 && (
                <span className={cn('text-sm font-medium', liked ? 'text-red-500' : 'text-white')}>{likeCount}</span>
              )}
            </button>
          </section>

          {/* Content */}
          <section className="w-full max-w-7xl mx-auto px-4 mt-0 relative z-10 pb-8">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Info */}
              <div className="lg:col-span-2 space-y-6 min-w-0">
                {/* Event Info - mobile only */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-6 lg:hidden"
                >
                  <h1 className="font-display font-bold text-3xl md:text-4xl mb-2">
                    {event.title}
                  </h1>
                  <p className="text-muted-foreground mb-4">
                    {event.city}, {event.state}
                  </p>
                  <p className="text-foreground font-semibold text-lg mb-4 break-words">
                    {event.venue}
                  </p>
                  {event.address && (
                    <div className="flex items-start gap-2 text-muted-foreground mb-4 min-w-0">
                      <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                      <span className="text-sm break-words">{event.address}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4 text-muted-foreground">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span className="text-sm break-words">{formatDate(event.date)}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="text-sm">{event.time}</span>
                    </div>
                  </div>
                </motion.div>

                {/* Tickets Section - grouped by sector */}
                {activeLots.length > 0 && (() => {
                  const groups = new Map<string, typeof activeLots>();
                  for (const lot of activeLots) {
                    const key = (lot.sector_name?.trim() || 'Ingresso');
                    if (!groups.has(key)) groups.set(key, [] as typeof activeLots);
                    groups.get(key)!.push(lot);
                  }
                  const entries = Array.from(groups.entries()).sort(([a], [b]) => {
                    if (a === 'Ingresso') return -1;
                    if (b === 'Ingresso') return 1;
                    return 0;
                  });
                  return (
                    <div className="space-y-4">
                       {entries.map(([sectorName, sectorLots], idx) => {
                         return (
                           <motion.div
                             key={sectorName}
                             initial={{ opacity: 0, y: 20 }}
                             animate={{ opacity: 1, y: 0 }}
                             transition={{ delay: 0.1 + idx * 0.05 }}
                             className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl overflow-hidden shadow-lg shadow-primary/5"
                           >
                             {/* Sector header */}
                             <div className="px-5 md:px-6 py-4 bg-gradient-to-r from-primary/15 via-primary/10 to-accent/10 border-b border-border/40">
                               <h3 className="font-display font-bold text-sm uppercase tracking-[0.2em] text-primary">
                                 {sectorName}
                               </h3>
                             </div>
                            {/* Lots */}
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
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* About */}
                {(event.description || event.short_description) && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="py-6"
                  >
                    <h3 className="font-display font-bold text-xl mb-4">Sobre o evento</h3>
                    <div className="text-muted-foreground leading-relaxed space-y-4">
                      {(event.description || event.short_description || '')
                        .split(/\n{2,}/)
                        .map((para: string, i: number) => (
                          <p key={i} className="whitespace-pre-wrap break-words">{para}</p>
                        ))}
                    </div>
                  </motion.div>
                )}

                {/* Realização */}
                {(() => {
                  const producer = (event as any).producer_profiles;
                  const brandName = producer?.brand_name;
                  const logoUrl = producer?.logo_url || festpagLogo;
                  if (!brandName) return null;
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.18 }}
                      className="py-6"
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
                    </motion.div>
                  );
                })()}
              </div>

              {/* Sidebar - Desktop only */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="hidden lg:block lg:sticky lg:top-24 h-fit"
              >
                <div className="bg-card rounded-2xl border border-border p-6">
                  <h3 className="font-display font-semibold text-lg mb-4">Resumo</h3>

                  {totalTickets > 0 ? (
                    <div className="space-y-3 mb-6">
                      {Object.entries(selectedLots).map(([lotId, qty]) => {
                        const lot = activeLots.find((l) => l.id === lotId);
                        if (!lot) return null;
                        return (
                          <div key={lotId} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {lot.name} x{qty}
                            </span>
                            <span>{formatPrice(lot.price * qty)}</span>
                          </div>
                        );
                      })}
                      <div className="border-t border-border pt-3 flex justify-between font-semibold">
                        <span>Total</span>
                        <span className="gradient-text text-xl">
                          {formatPrice(totalAmount)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm mb-6">
                      Selecione os ingressos desejados para continuar.
                    </p>
                  )}

                  {isEventFinished ? (
                    <div className="text-center">
                      <Badge variant="destructive" className="mb-2">Evento Encerrado</Badge>
                      <p className="text-sm text-muted-foreground">Este evento já foi finalizado.</p>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="hero"
                        size="xl"
                        className="w-full"
                        onClick={handleCheckout}
                        disabled={totalTickets === 0}
                      >
                        <Ticket className="w-5 h-5 mr-2" />
                        Comprar Ingressos
                      </Button>
                      <p className="text-xs text-muted-foreground text-center mt-4">
                        Pagamento 100% seguro via PIX ou cartão
                      </p>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          </section>
        </main>

        <Footer />

        {/* Mobile Fixed Bottom Bar */}
        <AnimatePresence>
          {totalTickets > 0 && (
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card border-t border-border px-4 py-3"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{totalTickets} ingresso{totalTickets > 1 ? 's' : ''}</p>
                  <p className="font-bold text-lg gradient-text">{formatPrice(totalAmount)}</p>
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

        {/* Auth Modal */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onAuthenticated={handleAuthenticated}
        />

        {/* Checkout Modal */}
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

interface LotCardProps {
  lot: EventLot;
  quantity: number;
  onQuantityChange: (delta: number) => void;
  formatPrice: (price: number) => string;
}

const LotCard = ({ lot, quantity, onQuantityChange, formatPrice }: LotCardProps) => {
  const available = lot.total_quantity - lot.sold_quantity - (lot.reserved_quantity || 0);
  const isSoldOut = available === 0 || (lot as any).manually_sold_out === true;

  const realPct = lot.total_quantity > 0 ? (lot.sold_quantity / lot.total_quantity) * 100 : 0;
  const fakePct = lot.fake_scarcity_enabled ? (lot.fake_scarcity_percentage || 0) : 0;
  const shownPct = Math.max(0, Math.min(100, Math.max(realPct, fakePct)));

  const isCritical = !isSoldOut && (shownPct >= 90 || available <= 10);
  const isWarning = !isSoldOut && !isCritical && shownPct >= 70;
  const showProgress = !isSoldOut && (lot.fake_scarcity_enabled || shownPct >= 70);

  return (
    <div
      className={cn(
        'px-5 md:px-6 py-5 transition-colors',
        isSoldOut && 'opacity-50',
        quantity > 0 && 'bg-primary/5'
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h4 className="font-bold text-base text-foreground">{lot.name}</h4>
            {isSoldOut && (
              <Badge variant="secondary" className="text-xs">Esgotado</Badge>
            )}
            {isCritical && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertCircle className="w-3 h-3" />
                Últimas unidades
              </Badge>
            )}
            {isWarning && (
              <Badge variant="secondary" className="text-xs gap-1 bg-orange-500/20 text-orange-400 border-orange-500/30">
                <AlertCircle className="w-3 h-3" />
                Quase esgotado
              </Badge>
            )}
          </div>

          {lot.description && (
            <p className="text-xs text-muted-foreground mb-2">{lot.description}</p>
          )}

          <div className="flex items-center gap-2">
            {lot.original_price && (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(lot.original_price)}
              </span>
            )}
            <span className="font-bold text-2xl text-foreground">
              {formatPrice(lot.price)}
            </span>
          </div>

          {showProgress && (
            <div className="mt-3 space-y-1">
              <Progress
                value={shownPct}
                className={cn(
                  'h-1.5',
                  isCritical && '[&>div]:bg-destructive'
                )}
              />
              <p className={cn(
                'text-xs',
                isCritical ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {Math.round(shownPct)}% vendido
              </p>
            </div>
          )}
        </div>

        {!isSoldOut && (
          <div
            className={cn(
              'flex items-center gap-1 shrink-0 rounded-full bg-background/40 backdrop-blur-sm border px-1.5 py-1.5 transition-colors',
              quantity > 0 ? 'border-primary/50' : 'border-border/50'
            )}
          >
            <button
              onClick={() => onQuantityChange(-1)}
              disabled={quantity === 0}
              className={cn(
                'w-10 h-10 rounded-full border flex items-center justify-center transition-all',
                quantity === 0
                  ? 'border-border/40 text-muted-foreground/50 cursor-not-allowed'
                  : 'border-border/60 bg-background/60 text-foreground hover:bg-primary/20 hover:border-primary/50'
              )}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span
              className={cn(
                'w-8 text-center text-lg font-semibold tabular-nums transition-colors',
                quantity > 0 ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {quantity}
            </span>
            <button
              onClick={() => onQuantityChange(1)}
              disabled={quantity >= 10 || quantity >= available}
              className={cn(
                'w-10 h-10 rounded-full border flex items-center justify-center transition-all',
                (quantity >= 10 || quantity >= available)
                  ? 'border-border/40 text-muted-foreground/50 cursor-not-allowed'
                  : 'border-border/60 bg-background/60 text-foreground hover:bg-primary/20 hover:border-primary/50'
              )}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventDetails;
