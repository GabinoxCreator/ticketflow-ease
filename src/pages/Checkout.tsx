import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  Ticket,
  User,
  Mail,
  Phone,
  Loader2,
  Check,
  CreditCard,
  QrCode,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEvent } from '@/hooks/useEvents';
import { useEventLots } from '@/hooks/useEventLots';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CartItem {
  lotId: string;
  quantity: number;
}

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  
  const eventId = searchParams.get('evento');
  const cartParam = searchParams.get('cart');
  
  const { data: event, isLoading: eventLoading } = useEvent(eventId || undefined);
  const { lots, isLoading: lotsLoading } = useEventLots(eventId || undefined);
  
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderCreated, setOrderCreated] = useState(false);
  
  // Parse cart from URL
  const cartItems: CartItem[] = useMemo(() => {
    if (!cartParam) return [];
    try {
      return JSON.parse(decodeURIComponent(cartParam));
    } catch {
      return [];
    }
  }, [cartParam]);

  // Pre-fill with user data
  useEffect(() => {
    if (profile) {
      setCustomerName(profile.nome_completo || '');
      setCustomerEmail(profile.email || '');
      setCustomerPhone(profile.whatsapp || '');
    } else if (user) {
      setCustomerEmail(user.email || '');
    }
  }, [profile, user]);

  const isLoading = eventLoading || lotsLoading;

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  // Calculate totals
  const orderSummary = useMemo(() => {
    if (!lots) return { items: [], total: 0, totalTickets: 0 };
    
    const items = cartItems
      .map(item => {
        const lot = lots.find(l => l.id === item.lotId);
        if (!lot) return null;
        return {
          lot,
          quantity: item.quantity,
          subtotal: lot.price * item.quantity,
        };
      })
      .filter(Boolean) as { lot: typeof lots[0]; quantity: number; subtotal: number }[];

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);

    return { items, total, totalTickets };
  }, [lots, cartItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customerName.trim() || !customerEmail.trim()) {
      toast.error('Preencha nome e email');
      return;
    }
    
    if (orderSummary.totalTickets === 0) {
      toast.error('Nenhum ingresso selecionado');
      return;
    }

    setIsSubmitting(true);
    
    try {
      if (paymentMethod === 'card') {
        // Use Stripe Checkout with Destination Charges
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: {
            eventId: eventId!,
            cartItems: cartItems,
            customerEmail: customerEmail.trim(),
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim() || null,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data?.url) {
          // Redirect to Stripe Checkout
          window.location.href = data.url;
          return;
        }
      } else {
        // PIX payment - create order locally (existing flow)
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            event_id: eventId!,
            user_id: user?.id || null,
            customer_name: customerName.trim(),
            customer_email: customerEmail.trim(),
            customer_phone: customerPhone.trim() || null,
            total_amount: orderSummary.total,
            status: 'pending',
            payment_method: paymentMethod,
          })
          .select()
          .single();

        if (orderError) throw orderError;

        // Create tickets for each item
        const ticketsToCreate = orderSummary.items.flatMap(item =>
          Array.from({ length: item.quantity }, () => ({
            order_id: order.id,
            event_id: eventId!,
            lot_id: item.lot.id,
            user_id: user?.id || null,
            holder_name: customerName.trim(),
            holder_email: customerEmail.trim(),
            holder_phone: customerPhone.trim() || null,
            status: 'valid' as const,
          }))
        );

        const { error: ticketsError } = await supabase
          .from('tickets')
          .insert(ticketsToCreate);

        if (ticketsError) throw ticketsError;

        // Update sold_quantity for each lot
        for (const item of orderSummary.items) {
          const { error: updateError } = await supabase
            .from('event_lots')
            .update({ sold_quantity: item.lot.sold_quantity + item.quantity })
            .eq('id', item.lot.id);

          if (updateError) {
            console.error('Error updating lot quantity:', updateError);
          }
        }

        setOrderCreated(true);
        toast.success('Pedido criado com sucesso!');
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast.error(error.message || 'Erro ao processar pedido');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event || cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display font-bold text-2xl mb-4">Carrinho vazio</h1>
          <Link to="/" className="text-primary hover:underline">
            Voltar para eventos
          </Link>
        </div>
      </div>
    );
  }

  if (orderCreated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display font-bold text-2xl mb-2">Pedido Realizado!</h1>
          <p className="text-muted-foreground mb-6">
            {paymentMethod === 'pix' 
              ? 'Complete o pagamento via PIX para confirmar seus ingressos.'
              : 'Seu pagamento está sendo processado.'}
          </p>
          <div className="bg-secondary/50 rounded-xl p-4 mb-6">
            <p className="text-sm text-muted-foreground mb-1">Total a pagar</p>
            <p className="font-display font-bold text-2xl gradient-text">
              {formatPrice(orderSummary.total)}
            </p>
          </div>
          <Button variant="hero" className="w-full" onClick={() => navigate('/')}>
            Voltar para Eventos
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Checkout - {event.title}</title>
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="container px-4 h-16 flex items-center">
            <Link
              to={`/evento/${eventId}`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Voltar</span>
            </Link>
            <h1 className="ml-4 font-display font-semibold">Checkout</h1>
          </div>
        </header>

        <main className="pt-24 pb-8 container px-4">
          <div className="max-w-4xl mx-auto grid lg:grid-cols-5 gap-8">
            {/* Form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-3"
            >
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Customer Info */}
                <div className="bg-card border border-border rounded-2xl p-6">
                  <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    Seus Dados
                  </h2>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">Nome completo *</Label>
                      <Input
                        id="name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Seu nome"
                        required
                        className="mt-1.5"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <div className="relative mt-1.5">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="seu@email.com"
                          required
                          className="pl-10"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="phone">WhatsApp (opcional)</Label>
                      <div className="relative mt-1.5">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="phone"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(formatPhone(e.target.value))}
                          placeholder="(11) 99999-9999"
                          maxLength={15}
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="bg-card border border-border rounded-2xl p-6">
                  <h2 className="font-display font-semibold text-lg mb-4">
                    Forma de Pagamento
                  </h2>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('pix')}
                      className={cn(
                        'p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                        paymentMethod === 'pix'
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <QrCode className="w-6 h-6" />
                      <span className="font-medium">PIX</span>
                      <span className="text-xs text-muted-foreground">Aprovação imediata</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card')}
                      className={cn(
                        'p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                        paymentMethod === 'card'
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <CreditCard className="w-6 h-6" />
                      <span className="font-medium">Cartão</span>
                      <span className="text-xs text-muted-foreground">Crédito ou débito</span>
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="hero"
                  size="xl"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Ticket className="w-5 h-5 mr-2" />
                      Finalizar Compra
                    </>
                  )}
                </Button>
              </form>
            </motion.div>

            {/* Order Summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-2"
            >
              <div className="bg-card border border-border rounded-2xl p-6 lg:sticky lg:top-24">
                <h2 className="font-display font-semibold text-lg mb-4">
                  Resumo do Pedido
                </h2>

                {/* Event Info */}
                <div className="flex gap-3 pb-4 border-b border-border mb-4">
                  <img
                    src={event.image_url || '/placeholder.svg'}
                    alt={event.title}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{event.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {new Date(event.date).toLocaleDateString('pt-BR')} às {event.time}
                    </p>
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-3 pb-4 border-b border-border mb-4">
                  {orderSummary.items.map(item => (
                    <div key={item.lot.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.lot.name} x{item.quantity}
                      </span>
                      <span>{formatPrice(item.subtotal)}</span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total</span>
                  <span className="font-display font-bold text-2xl gradient-text">
                    {formatPrice(orderSummary.total)}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  Pagamento 100% seguro
                </p>
              </div>
            </motion.div>
          </div>
        </main>
      </div>
    </>
  );
};

export default Checkout;
