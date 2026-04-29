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
  Info,
  Receipt,
  Lock,
  ShieldCheck,
  BadgeCheck,
  Crown,
  Sparkles,
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

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).toUpperCase().replace(/\./g, '');
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

  const isVipSector = (name: string) => /vip|premium|camarote|backstage/i.test(name);

  return (
    <>
      <Helmet>
        <title>{event.title} - FestPag</title>
        <meta name="description" content={event.short_description || event.description || ''} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main className={cn("pt-20 w-full", totalTickets > 0 && "pb-28 lg:pb-0")}>
          {/* Evento Encerrado Banner */}
          {isEventFinished && (
            <div className="w-full bg-gradient-to-r from-destructive/15 to-destructive/5 border-b border-destructive/30 backdrop-blur-xl">
              <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-destructive/40 to-destructive/20 border border-destructive/40 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                </div>
                <span className="font-semibold text-destructive">Evento Encerrado</span>
              </div>
            </div>
          )}

          {/* Desktop Hero Split */}
          <section className="relative overflow-hidden hidden lg:flex pt-10 w-full max-w-7xl mx-auto px-4 min-h-[60vh] items-center gap-12">
            {/* Background com glow */}
            <div className="absolute inset-0 -z-10">
              <img
                src={event.image_url || '/placeholder.svg'}
                alt=""
                className="w-full h-full object-cover scale-110 blur-3xl opacity-30"
              />
              <div className="absolute inset-0 bg-background/70" />
              <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full bg-primary/15 blur-3xl" />
              <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-accent/15 blur-3xl" />
            </div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 space-y-5 min-w-0"
            >
              {/* Chip data + cidade */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-bold uppercase tracking-wider">
                <Calendar className="w-3.5 h-3.5" />
                {formatDateShort(event.date)} · {event.city}
              </div>

              <div className="flex items-start gap-4">
                <h1 className="font-display font-bold text-4xl xl:text-5xl leading-tight gradient-text flex-1">
                  {event.title}
                </h1>
                <button
                  onClick={handleLike}
                  className="flex items-center gap-1.5 px-3 h-10 rounded-full bg-card/60 backdrop-blur-xl border border-border/60 hover:border-primary/50 transition-all flex-shrink-0"
                >
                  <Heart className={cn('w-4 h-4 transition-all', liked ? 'fill-red-500 text-red-500 scale-110' : 'text-muted-foreground')} />
                  {likeCount > 0 && (
                    <span className="text-sm font-bold tabular-nums">{likeCount}</span>
                  )}
                </button>
              </div>

              {/* Pills info */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="flex items-center gap-3 bg-card/60 backdrop-blur-xl border border-border/60 rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Data</p>
                    <p className="text-sm font-semibold truncate">{formatDate(event.date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-card/60 backdrop-blur-xl border border-border/60 rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Horário</p>
                    <p className="text-sm font-semibold">{event.time}</p>
                  </div>
                </div>
                <div className="col-span-2 flex items-center gap-3 bg-card/60 backdrop-blur-xl border border-border/60 rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Local</p>
                    <p className="text-sm font-semibold truncate">{event.venue}</p>
                    {event.address && (
                      <p className="text-xs text-muted-foreground truncate">{event.address}</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 relative"
            >
              {/* Glow externo */}
              <div className="absolute -inset-6 bg-gradient-to-br from-primary/30 to-accent/30 rounded-3xl blur-3xl opacity-50" />
              {/* Borda gradient */}
              <div className="relative p-[2px] rounded-3xl bg-gradient-to-br from-primary via-accent to-primary shadow-2xl shadow-primary/30">
                <div className="rounded-[22px] overflow-hidden bg-background">
                  <img
                    src={event.image_url || '/placeholder.svg'}
                    alt={event.title}
                    className="w-full h-auto max-h-[55vh] object-cover"
                  />
                </div>
              </div>
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
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
            <button
              onClick={handleLike}
              className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 bg-background/40 backdrop-blur-xl border border-white/10 rounded-full px-3 h-10 transition-all hover:bg-background/60"
            >
              <Heart className={cn('w-4 h-4 transition-all', liked ? 'fill-red-500 text-red-500 scale-110' : 'text-white')} />
              {likeCount > 0 && (
                <span className={cn('text-sm font-bold tabular-nums', liked ? 'text-red-500' : 'text-white')}>{likeCount}</span>
              )}
            </button>
          </section>

          {/* Content */}
          <section className="w-full max-w-7xl mx-auto px-4 mt-0 relative z-10 pb-8">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Info */}
              <div className="lg:col-span-2 space-y-5 min-w-0">
                {/* Event Info - mobile only */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="lg:hidden mt-6 rounded-2xl bg-gradient-to-br from-card/90 to-secondary/30 backdrop-blur-xl border border-border/60 p-5 space-y-4 shadow-xl shadow-primary/5 overflow-hidden relative"
                >
                  <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                  <div className="relative inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-wider">
                    <Calendar className="w-3 h-3" />
                    {formatDateShort(event.date)} · {event.city}
                  </div>
                  <h1 className="relative font-display font-bold text-2xl md:text-3xl gradient-text leading-tight break-words">
                    {event.title}
                  </h1>
                  <div className="relative space-y-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="text-sm text-foreground/90 break-words">{formatDate(event.date)} · {event.time}</span>
                    </div>
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground break-words">{event.venue}</p>
                        {event.address && (
                          <p className="text-xs text-muted-foreground break-words">{event.address}</p>
                        )}
                      </div>
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
                        const isVip = isVipSector(sectorName);
                        return (
                          <motion.div
                            key={sectorName}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + idx * 0.05 }}
                            className="bg-gradient-to-br from-card/90 to-secondary/30 backdrop-blur-xl border border-border/60 rounded-2xl shadow-xl shadow-primary/5 overflow-hidden"
                          >
                            <div className={cn(
                              'flex items-center justify-between px-5 py-3.5 border-b border-border/60',
                              isVip
                                ? 'bg-gradient-to-r from-amber-500/10 via-accent/10 to-primary/10'
                                : 'bg-gradient-to-r from-primary/10 to-accent/10'
                            )}>
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={cn(
                                  'w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0',
                                  isVip
                                    ? 'bg-gradient-to-br from-amber-500/30 to-accent/30 border-amber-500/40'
                                    : 'bg-gradient-to-br from-primary/30 to-accent/30 border-primary/40'
                                )}>
                                  {isVip ? (
                                    <Crown className="w-4 h-4 text-amber-400" />
                                  ) : (
                                    <Ticket className="w-4 h-4 text-primary" />
                                  )}
                                </div>
                                <h3 className="font-display font-bold text-base truncate">
                                  {sectorName}
                                </h3>
                              </div>
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-background/60 border border-border/60 text-muted-foreground flex-shrink-0">
                                {sectorLots.length} {sectorLots.length === 1 ? 'opção' : 'opções'}
                              </span>
                            </div>
                            <div className="px-5">
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
                    className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/60 p-6"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                        <Info className="w-4 h-4 text-primary" />
                      </div>
                      <h3 className="font-display font-bold text-lg">Sobre o evento</h3>
                    </div>
                    <p className="text-foreground/80 leading-relaxed whitespace-pre-line">
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
                <div className="relative rounded-2xl bg-gradient-to-br from-card/90 to-secondary/40 backdrop-blur-xl border border-border/60 p-6 shadow-2xl shadow-primary/10 overflow-hidden">
                  <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/15 blur-3xl pointer-events-none" />

                  <div className="relative flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                      <Receipt className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Resumo do pedido</p>
                      <p className="font-display font-bold text-base">Seus ingressos</p>
                    </div>
                  </div>

                  {totalTickets > 0 ? (
                    <div className="relative space-y-2.5 mb-5">
                      {Object.entries(selectedLots).map(([lotId, qty]) => {
                        const lot = activeLots.find((l) => l.id === lotId);
                        if (!lot) return null;
                        return (
                          <div key={lotId} className="flex justify-between items-center text-sm gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary flex-shrink-0">
                                {qty}x
                              </span>
                              <span className="text-foreground/90 truncate">{lot.name}</span>
                            </div>
                            <span className="font-medium tabular-nums flex-shrink-0">{formatPrice(lot.price * qty)}</span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between items-center rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 px-4 py-3 mt-4 shadow-lg shadow-primary/10">
                        <span className="text-sm font-semibold uppercase tracking-wide">Total</span>
                        <span className="font-display font-bold text-2xl gradient-text tabular-nums">
                          {formatPrice(totalAmount)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative rounded-xl bg-secondary/40 border border-border/60 p-4 mb-5 text-center">
                      <Sparkles className="w-5 h-5 text-primary mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Selecione os ingressos desejados para continuar.
                      </p>
                    </div>
                  )}

                  {isEventFinished ? (
                    <div className="relative text-center">
                      <Badge variant="destructive" className="mb-2">Evento Encerrado</Badge>
                      <p className="text-sm text-muted-foreground">Este evento já foi finalizado.</p>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="hero"
                        size="lg"
                        className="relative w-full h-14 text-base font-semibold"
                        onClick={handleCheckout}
                        disabled={totalTickets === 0}
                      >
                        <Ticket className="w-5 h-5 mr-2" />
                        Comprar Ingressos
                      </Button>

                      <div className="relative flex items-center justify-center gap-3 mt-4">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Lock className="w-3 h-3 text-primary" />
                          SSL
                        </div>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <ShieldCheck className="w-3 h-3 text-primary" />
                          Mercado Pago
                        </div>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <BadgeCheck className="w-3 h-3 text-primary" />
                          Garantia
                        </div>
                      </div>
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
              className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-gradient-to-t from-card to-card/95 backdrop-blur-xl border-t border-primary/20 px-4 py-3 shadow-2xl shadow-primary/20 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-60" />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {totalTickets} ingresso{totalTickets > 1 ? 's' : ''}
                  </p>
                  <p className="font-display font-bold text-xl gradient-text tabular-nums">{formatPrice(totalAmount)}</p>
                </div>
                <Button
                  variant="hero"
                  size="lg"
                  onClick={handleCheckout}
                  className="shrink-0 h-12 px-6"
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
  const hasDiscount = lot.original_price && lot.original_price > lot.price;
  const discountPct = hasDiscount
    ? Math.round(((lot.original_price! - lot.price) / lot.original_price!) * 100)
    : 0;
  const isSelected = quantity > 0;

  return (
    <div
      className={cn(
        'relative py-4 border-b border-border/60 last:border-b-0 transition-all -mx-5 px-5',
        isSoldOut && 'opacity-50',
        isSelected && 'bg-primary/5'
      )}
    >
      {isSelected && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary to-accent rounded-full" />
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h4 className="font-bold text-sm md:text-base text-foreground">{lot.name}</h4>
            {isSoldOut && (
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">Esgotado</Badge>
            )}
            {!isSoldOut && available < 50 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-destructive to-accent text-destructive-foreground shadow-sm">
                <AlertCircle className="w-2.5 h-2.5" />
                Últimos
              </span>
            )}
            {hasDiscount && !isSoldOut && (
              <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                −{discountPct}%
              </span>
            )}
          </div>

          {lot.description && (
            <p className="text-xs text-muted-foreground mb-1.5 break-words">{lot.description}</p>
          )}

          <div className="flex items-baseline gap-2 flex-wrap">
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through tabular-nums">
                {formatPrice(lot.original_price!)}
              </span>
            )}
            <span className="font-display font-bold text-lg tabular-nums">
              {formatPrice(lot.price)}
            </span>
          </div>
        </div>

        {!isSoldOut && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onQuantityChange(-1)}
              disabled={quantity === 0}
              className={cn(
                'w-10 h-10 rounded-xl border flex items-center justify-center transition-all',
                quantity === 0
                  ? 'border-border/40 text-muted-foreground/40 cursor-not-allowed'
                  : 'border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/60 active:scale-95'
              )}
            >
              <Minus className="w-4 h-4" />
            </button>
            <div className={cn(
              'min-w-[44px] h-10 px-2 rounded-lg flex items-center justify-center font-bold text-base tabular-nums transition-colors',
              quantity > 0 ? 'bg-primary/15 text-primary' : 'text-foreground'
            )}>
              {quantity}
            </div>
            <button
              onClick={() => onQuantityChange(1)}
              disabled={quantity >= 10 || quantity >= available}
              className={cn(
                'w-10 h-10 rounded-xl border flex items-center justify-center transition-all',
                (quantity >= 10 || quantity >= available)
                  ? 'border-border/40 text-muted-foreground/40 cursor-not-allowed'
                  : 'border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/60 active:scale-95'
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
