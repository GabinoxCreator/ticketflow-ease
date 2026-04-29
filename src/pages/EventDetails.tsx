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
  sector_name?: string | null;
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

      <div className="min-h-screen bg-background relative overflow-x-hidden">
        {/* Ambient background glows */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px] animate-pulse" />
          <div className="absolute bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-accent/10 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <Header />

        <main className={cn("pt-20 w-full relative z-0", totalTickets > 0 && "pb-24 lg:pb-0")}>
          {/* Evento Encerrado Banner */}
          {isEventFinished && (
            <div className="w-full bg-destructive/10 border-b border-destructive/20 backdrop-blur-md">
              <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-center gap-2">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <span className="font-semibold text-destructive">Evento Encerrado</span>
              </div>
            </div>
          )}

        {/* Desktop Hero Split */}
          <section className="relative overflow-hidden hidden lg:flex pt-12 w-full max-w-7xl mx-auto px-4 min-h-[60vh] items-center gap-16">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="flex-1 space-y-6"
            >
              <div className="space-y-2">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary px-3 py-1 text-xs uppercase tracking-wider mb-4">
                    Evento Confirmado
                  </Badge>
                </motion.div>
                <h1 className="font-display font-bold text-5xl xl:text-6xl tracking-tight leading-[1.1]">
                  {event.title}
                </h1>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="bg-secondary/40 backdrop-blur-md border border-white/5 rounded-full px-4 py-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{event.city}, {event.state}</span>
                </div>
                <div className="bg-secondary/40 backdrop-blur-md border border-white/5 rounded-full px-4 py-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{formatDate(event.date)}</span>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <p className="text-2xl font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent break-words">
                  {event.venue}
                </p>
                {event.address && (
                  <div className="flex items-start gap-3 text-muted-foreground/80 max-w-md">
                    <div className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center shrink-0 border border-white/5">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <span className="break-words text-base pt-1">{event.address}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-8 pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest">Início</p>
                    <p className="font-bold text-lg">{event.time}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex-1 relative group"
            >
              <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 to-accent/20 blur-2xl opacity-50 group-hover:opacity-75 transition-opacity" />
              <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                <img
                  src={event.image_url || '/placeholder.svg'}
                  alt={event.title}
                  className="w-full h-auto aspect-[4/5] object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
              </div>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleLike}
                className="absolute top-6 right-6 z-10 flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-4 py-2.5 transition-all hover:bg-black/60"
              >
                <Heart className={cn('w-5 h-5 transition-colors', liked ? 'fill-red-500 text-red-500' : 'text-white')} />
                <span className={cn('text-sm font-semibold', liked ? 'text-red-500' : 'text-white')}>
                  {likeCount > 0 ? likeCount : 'Curtir'}
                </span>
              </motion.button>
            </motion.div>
          </section>

          {/* Mobile Banner */}
          <section className="lg:hidden relative overflow-x-clip bg-black/20 max-w-full">
            <div className="w-full aspect-[4/5] flex items-center justify-center overflow-hidden">
              <img
                src={event.image_url || '/placeholder.svg'}
                alt={event.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
            
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleLike}
              className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full p-3 transition-colors"
            >
              <Heart className={cn('w-5 h-5 transition-colors', liked ? 'fill-red-500 text-red-500' : 'text-white')} />
            </motion.button>
          </section>

          {/* Content */}
          <section className="w-full max-w-7xl mx-auto px-4 mt-0 relative z-10 pb-8">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Info */}
              <div className="lg:col-span-2 space-y-8 min-w-0">
                {/* Event Info - mobile only */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-8 lg:hidden space-y-6"
                >
                  <div className="space-y-2">
                    <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary text-[10px] uppercase tracking-widest">
                      Evento Confirmado
                    </Badge>
                    <h1 className="font-display font-bold text-4xl leading-tight">
                      {event.title}
                    </h1>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-secondary/30 backdrop-blur-sm rounded-2xl p-4 border border-white/5">
                      <Calendar className="w-5 h-5 text-primary mb-2" />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Data</p>
                      <p className="font-bold text-sm truncate">{formatDate(event.date).split(',')[0]}</p>
                    </div>
                    <div className="bg-secondary/30 backdrop-blur-sm rounded-2xl p-4 border border-white/5">
                      <Clock className="w-5 h-5 text-primary mb-2" />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Horário</p>
                      <p className="font-bold text-sm">{event.time}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-sm flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {event.city}, {event.state}
                      </p>
                      <p className="font-semibold text-xl break-words text-primary-foreground">
                        {event.venue}
                      </p>
                    </div>
                    {event.address && (
                      <div className="p-4 rounded-2xl bg-secondary/20 border border-white/5 flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm text-muted-foreground leading-relaxed break-words">{event.address}</span>
                      </div>
                    )}
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
                    <div className="space-y-6">
                      {entries.map(([sectorName, sectorLots], idx) => (
                        <motion.div
                          key={sectorName}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 + idx * 0.05 }}
                          className="bg-gradient-to-br from-card/80 to-secondary/30 backdrop-blur-xl rounded-3xl border border-white/5 overflow-hidden shadow-xl"
                        >
                          <div className="px-6 py-4 bg-primary/10 border-b border-primary/10 flex items-center justify-between">
                            <h3 className="font-display font-bold text-xs uppercase tracking-[0.2em] text-primary">
                              {sectorName}
                            </h3>
                            <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/20 text-primary">
                              {sectorLots.length} opção{sectorLots.length > 1 ? 'ões' : ''}
                            </Badge>
                          </div>
                          <div className="p-2 md:p-4">
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
                      ))}
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
                <div className="bg-gradient-to-br from-card to-secondary/40 backdrop-blur-xl rounded-3xl border border-white/5 p-8 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-primary/20 transition-colors" />
                  
                  <h3 className="font-display font-bold text-xl mb-6 flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-primary" />
                    Resumo do Pedido
                  </h3>

                  {totalTickets > 0 ? (
                    <div className="space-y-4 mb-8">
                      {Object.entries(selectedLots).map(([lotId, qty]) => {
                        const lot = activeLots.find((l) => l.id === lotId);
                        if (!lot) return null;
                        return (
                          <div key={lotId} className="flex justify-between items-start text-sm">
                            <div className="space-y-1">
                              <p className="font-medium">{lot.name}</p>
                              <p className="text-xs text-muted-foreground">{qty}x {formatPrice(lot.price)}</p>
                            </div>
                            <span className="font-semibold">{formatPrice(lot.price * qty)}</span>
                          </div>
                        );
                      })}
                      <div className="pt-4 border-t border-white/5 space-y-4">
                        <div className="flex justify-between items-end">
                          <span className="text-muted-foreground text-sm">Valor Total</span>
                          <span className="gradient-text text-3xl font-bold tracking-tight">
                            {formatPrice(totalAmount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mx-auto border border-white/5">
                        <Ticket className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <p className="text-muted-foreground text-sm max-w-[200px] mx-auto">
                        Selecione seus ingressos para continuar com a reserva.
                      </p>
                    </div>
                  )}

                  {isEventFinished ? (
                    <div className="text-center p-4 rounded-2xl bg-destructive/10 border border-destructive/20">
                      <p className="text-sm font-semibold text-destructive">Evento Encerrado</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Button
                        variant="hero"
                        size="xl"
                        className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20"
                        onClick={handleCheckout}
                        disabled={totalTickets === 0}
                      >
                        Comprar Agora
                      </Button>
                      <div className="flex items-center justify-center gap-4 pt-2">
                        <div className="flex flex-col items-center gap-1 opacity-60">
                          <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                          </div>
                          <span className="text-[10px] uppercase tracking-tighter">Seguro</span>
                        </div>
                        <div className="flex flex-col items-center gap-1 opacity-60">
                          <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          </div>
                          <span className="text-[10px] uppercase tracking-tighter">Oficial</span>
                        </div>
                      </div>
                    </div>
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
