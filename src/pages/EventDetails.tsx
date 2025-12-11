import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  MapPin,
  Share2,
  Heart,
  ChevronLeft,
  Minus,
  Plus,
  Ticket,
  Users,
  AlertCircle,
  Loader2,
  Flame,
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

const categoryLabels: Record<string, string> = {
  'Festas e Shows': 'Festas e Shows',
  'Esportes': 'Esportes',
  'Teatro e Cultura': 'Teatro e Cultura',
  'Gastronomia': 'Gastronomia',
  'Congressos': 'Congressos',
  'Cursos e Workshops': 'Cursos e Workshops',
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

  const activeLots = lots?.filter(lot => lot.is_active) || [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
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
    setIsCheckoutOpen(true);
  };

  // Build cart items for checkout modal
  const cartItems = Object.entries(selectedLots).map(([lotId, quantity]) => {
    const lot = activeLots.find((l) => l.id === lotId);
    return {
      lotId,
      lotName: lot?.name || '',
      quantity,
      price: lot?.price || 0,
    };
  });

  const totalAvailable = activeLots.reduce((sum, lot) => sum + lot.total_quantity, 0);
  const totalSold = activeLots.reduce((sum, lot) => sum + lot.sold_quantity, 0);
  const realSoldPercentage = totalAvailable > 0 ? Math.round((totalSold / totalAvailable) * 100) : 0;
  
  // Use fake scarcity percentage if enabled, otherwise use real percentage
  const displayPercentage = (event as any).fake_scarcity_enabled 
    ? ((event as any).fake_scarcity_percentage || 50) 
    : realSoldPercentage;

  return (
    <>
      <Helmet>
        <title>{event.title} - IngressosRP</title>
        <meta name="description" content={event.short_description || event.description || ''} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main className="pt-20">
          {/* Hero */}
          <section className="relative h-[50vh] md:h-[60vh] overflow-hidden">
            <img
              src={event.image_url || '/placeholder.svg'}
              alt={event.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

            {/* Back Button */}
            <Link
              to="/"
              className="absolute top-24 left-4 md:left-8 flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors glass px-4 py-2 rounded-full"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Voltar</span>
            </Link>

            {/* Actions */}
            <div className="absolute top-24 right-4 md:right-8 flex gap-2">
              <Button variant="glass" size="icon">
                <Share2 className="w-5 h-5" />
              </Button>
              <Button variant="glass" size="icon">
                <Heart className="w-5 h-5" />
              </Button>
            </div>
          </section>

          {/* Content */}
          <section className="container px-4 -mt-32 relative z-10 pb-32">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Info */}
              <div className="lg:col-span-2 space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-2xl border border-border p-6 md:p-8"
                >
                  <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">
                    {categoryLabels[event.category] || event.category}
                  </Badge>

                  <h1 className="font-display font-bold text-3xl md:text-4xl mb-4">
                    {event.title}
                  </h1>

                  <div className="flex flex-wrap gap-4 text-muted-foreground mb-6">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      <span>{formatDate(event.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      <span>{event.time}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-secondary/50 rounded-xl mb-6">
                    <MapPin className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">{event.venue}</p>
                      <p className="text-sm text-muted-foreground">
                        {event.address} - {event.city}, {event.state}
                      </p>
                    </div>
                  </div>

                  <h3 className="font-display font-semibold text-lg mb-3">Sobre o evento</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {event.description || event.short_description}
                  </p>

                  {/* Progress */}
                  {totalAvailable > 0 && (
                    <div className="mt-6 p-4 bg-secondary/50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {(event as any).fake_scarcity_enabled ? (
                            <Flame className="w-5 h-5 text-orange-500" />
                          ) : (
                            <Users className="w-5 h-5 text-primary" />
                          )}
                          <span className="font-medium">{displayPercentage}% vendido</span>
                        </div>
                        <span className="text-muted-foreground text-sm">
                          {(event as any).fake_scarcity_enabled 
                            ? 'Restam poucos!' 
                            : `${totalAvailable - totalSold} ingressos restantes`}
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-primary rounded-full transition-all duration-500"
                          style={{ width: `${displayPercentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </motion.div>

                {/* Lots */}
                {activeLots.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-card rounded-2xl border border-border p-6 md:p-8"
                  >
                    <h3 className="font-display font-semibold text-xl mb-6">
                      Escolha seus ingressos
                    </h3>

                    <div className="space-y-4">
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
              </div>

              {/* Sidebar - Checkout */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="lg:sticky lg:top-24 h-fit"
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
                </div>
              </motion.div>
            </div>
          </section>
        </main>

        <Footer />

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
  const isSelected = quantity > 0;
  
  // Calculate real sold percentage for this lot
  const realSoldPercentage = lot.total_quantity > 0 
    ? Math.round((lot.sold_quantity / lot.total_quantity) * 100) 
    : 0;
  
  // Use fake scarcity if enabled, otherwise real percentage
  const displayPercentage = lot.fake_scarcity_enabled 
    ? (lot.fake_scarcity_percentage || 50) 
    : realSoldPercentage;

  return (
    <div
      className={cn(
        'border rounded-xl p-4 transition-all duration-300',
        isSoldOut
          ? 'border-border bg-secondary/30 opacity-60'
          : isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold">{lot.name}</h4>
            {isSoldOut && (
              <Badge variant="secondary" className="text-xs">
                Esgotado
              </Badge>
            )}
            {available > 0 && available < 50 && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertCircle className="w-3 h-3" />
                Últimos
              </Badge>
            )}
          </div>

          {lot.description && (
            <p className="text-sm text-muted-foreground mb-2">{lot.description}</p>
          )}

          <div className="flex items-center gap-3">
            {lot.original_price && (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(lot.original_price)}
              </span>
            )}
            <span className="font-display font-bold text-lg gradient-text">
              {formatPrice(lot.price)}
            </span>
          </div>

          {/* Scarcity bar for each lot */}
          {!isSoldOut && displayPercentage > 0 && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                {lot.fake_scarcity_enabled ? (
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                ) : (
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className={cn(
                  "font-medium",
                  lot.fake_scarcity_enabled && "text-orange-500"
                )}>
                  {displayPercentage}% vendido
                </span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    lot.fake_scarcity_enabled 
                      ? "bg-gradient-to-r from-orange-500 to-red-500" 
                      : "bg-primary"
                  )}
                  style={{ width: `${displayPercentage}%` }}
                />
              </div>
            </div>
          )}

          {isSoldOut ? null : (
            <p className="text-xs text-muted-foreground mt-2">
              {available} disponíveis
            </p>
          )}
        </div>

        {!isSoldOut && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onQuantityChange(-1)}
              disabled={quantity === 0}
              className="h-9 w-9"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="w-8 text-center font-semibold">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onQuantityChange(1)}
              disabled={quantity >= 10 || quantity >= available}
              className="h-9 w-9"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventDetails;
