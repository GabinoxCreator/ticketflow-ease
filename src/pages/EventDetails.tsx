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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useEvent } from '@/hooks/useEvents';
import { useEventLots } from '@/hooks/useEventLots';
import { CheckoutModal } from '@/components/checkout/CheckoutModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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
  description?: string | null;
  is_active?: boolean | null;
  fake_scarcity_enabled?: boolean | null;
  fake_scarcity_percentage?: number | null;
}

const EventDetails = () => {
  const { id } = useParams<{ id: string }>();
  const { data: event, isLoading: eventLoading } = useEvent(id);
  const { lots, isLoading: lotsLoading } = useEventLots(id);
  const [selectedLots, setSelectedLots] = useState<Record<string, number>>({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    if (!id) return;
    const anonymousId = getAnonymousId();
    
    const fetchLikes = async () => {
      const { count } = await supabase
        .from('event_likes' as any)
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id);
      setLikeCount(count || 0);

      const { data } = await supabase
        .from('event_likes' as any)
        .select('id')
        .eq('event_id', id)
        .eq('anonymous_id', anonymousId)
        .maybeSingle();
      setLiked(!!data);
    };
    fetchLikes();
  }, [id]);

  const handleLike = useCallback(async () => {
    if (!id) return;
    const anonymousId = getAnonymousId();
    
    if (liked) {
      setLiked(false);
      setLikeCount(prev => Math.max(0, prev - 1));
      await supabase
        .from('event_likes' as any)
        .delete()
        .eq('event_id', id)
        .eq('anonymous_id', anonymousId);
    } else {
      setLiked(true);
      setLikeCount(prev => prev + 1);
      await supabase
        .from('event_likes' as any)
        .insert({ event_id: id, anonymous_id: anonymousId } as any);
    }
  }, [id, liked]);

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

  const isEventFinished = event ? (event.status === 'finished' || new Date(event.date + 'T23:59:59') < new Date()) : false;
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

  const handleCheckout = () => {
    if (totalTickets === 0) {
      toast.error('Selecione pelo menos um ingresso');
      return;
    }
    if (!user) {
      setIsAuthModalOpen(true);
    } else {
      setIsCheckoutOpen(true);
    }
  };

  const handleAuthenticated = () => {
    setIsAuthModalOpen(false);
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
              <p className="text-primary font-semibold text-xl break-words">
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
                  <p className="text-primary font-semibold text-lg mb-4 break-words">
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

                {/* Tickets Section */}
                {activeLots.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-card rounded-2xl border border-border p-5 md:p-8"
                  >
                    <h3 className="font-display font-bold text-sm uppercase tracking-wider mb-4">
                      Ingressos
                    </h3>
                    <div className="border-t border-border">
                      {activeLots.map((lot) => (
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
                )}

                {/* About */}
                {(event.description || event.short_description) && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="py-6"
                  >
                    <h3 className="font-display font-bold text-xl mb-4">Sobre o evento</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {event.description || event.short_description}
                    </p>
                  </motion.div>
                )}
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
          eventId={id || ''}
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
  const available = lot.total_quantity - lot.sold_quantity;
  const isSoldOut = available === 0;

  return (
    <div
      className={cn(
        'py-4 border-b border-border last:border-b-0',
        isSoldOut && 'opacity-50'
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-bold text-sm uppercase tracking-wide">{lot.name}</h4>
            {isSoldOut && (
              <Badge variant="secondary" className="text-xs">Esgotado</Badge>
            )}
            {!isSoldOut && available < 50 && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertCircle className="w-3 h-3" />
                Últimos
              </Badge>
            )}
          </div>

          {lot.description && (
            <p className="text-xs text-muted-foreground mb-1">{lot.description}</p>
          )}

          <div className="flex items-center gap-2">
            {lot.original_price && (
              <span className="text-xs text-muted-foreground line-through">
                {formatPrice(lot.original_price)}
              </span>
            )}
            <span className="font-semibold text-base">
              {formatPrice(lot.price)}
            </span>
          </div>
        </div>

        {!isSoldOut && (
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onQuantityChange(-1)}
              disabled={quantity === 0}
              className={cn(
                'w-9 h-9 rounded-full border flex items-center justify-center transition-colors',
                quantity === 0
                  ? 'border-muted text-muted cursor-not-allowed'
                  : 'border-muted-foreground text-foreground hover:bg-muted'
              )}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-6 text-center font-semibold text-sm">{quantity}</span>
            <button
              onClick={() => onQuantityChange(1)}
              disabled={quantity >= 10 || quantity >= available}
              className={cn(
                'w-9 h-9 rounded-full border flex items-center justify-center transition-colors',
                (quantity >= 10 || quantity >= available)
                  ? 'border-muted text-muted cursor-not-allowed'
                  : 'border-muted-foreground text-foreground hover:bg-muted'
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
