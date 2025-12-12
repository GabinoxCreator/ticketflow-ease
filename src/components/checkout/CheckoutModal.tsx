import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronLeft } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckoutStepProgressiveForm } from './CheckoutStepProgressiveForm';
import { CheckoutStepPayment } from './CheckoutStepPayment';
import { CheckoutStepPix } from './CheckoutStepPix';
import { CheckoutStepAwaitingPayment } from './CheckoutStepAwaitingPayment';
import { CheckoutStepSuccess } from './CheckoutStepSuccess';
import { CheckoutStepExpired } from './CheckoutStepExpired';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type CheckoutStep = 'form' | 'payment' | 'pix' | 'awaiting' | 'success' | 'expired';

interface CartItem {
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventVenue: string;
  items: CartItem[];
  totalAmount: number;
}

export function CheckoutModal({
  isOpen,
  onClose,
  eventId,
  eventTitle,
  eventDate,
  eventTime,
  eventVenue,
  items,
  totalAmount,
}: CheckoutModalProps) {
  const { user, profile } = useAuth();
  const [step, setStep] = useState<CheckoutStep>('form');
  const [customerData, setCustomerData] = useState({
    cpf: '',
    name: '',
    email: '',
    phone: '',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{
    code: string;
    expiresAt: Date;
  } | null>(null);

  // Check if user is already authenticated - skip directly to payment
  useEffect(() => {
    if (user && isOpen) {
      // User is logged in, skip to payment with pre-filled data
      setCustomerData({
        cpf: '', // CPF will need to be entered if not available
        name: profile?.nome_completo || user.user_metadata?.nome_completo || '',
        email: user.email || '',
        phone: profile?.whatsapp || '',
      });
      setStep('payment');
    } else if (isOpen) {
      // Not logged in, start with form
      setStep('form');
    }
  }, [user, isOpen, profile]);

  const handleFormComplete = (data: {
    cpf: string;
    name: string;
    email: string;
    phone: string;
    password?: string;
  }) => {
    setCustomerData({
      cpf: data.cpf,
      name: data.name,
      email: data.email,
      phone: data.phone,
    });
    // TODO: If password is provided, create account
    setStep('payment');
  };

  const handlePaymentSelect = async (method: 'pix' | 'card') => {
    setIsProcessing(true);

    try {
      if (method === 'card') {
        // Redirect to Stripe Checkout
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: {
            eventId,
            items: items.map(item => ({ lotId: item.lotId, quantity: item.quantity })),
            customerName: customerData.name,
            customerEmail: customerData.email,
            customerCPF: customerData.cpf,
            customerPhone: customerData.phone,
          },
        });

        if (error) throw error;

        if (data?.url) {
          window.location.href = data.url;
        }
      } else {
        // PIX payment - create order and generate PIX code
        const { data, error } = await supabase.functions.invoke('create-pix-payment', {
          body: {
            eventId,
            items: items.map(item => ({ lotId: item.lotId, quantity: item.quantity })),
            customerName: customerData.name,
            customerEmail: customerData.email,
            customerCPF: customerData.cpf,
            customerPhone: customerData.phone,
          },
        });

        if (error) throw error;

        setOrderId(data.orderId);
        setPixData({
          code: data.pixCode,
          expiresAt: new Date(data.expiresAt),
        });
        setStep('pix');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.message || 'Erro ao processar pagamento');
    } finally {
      setIsProcessing(false);
    }
  };

  const checkPaymentStatus = useCallback(async (): Promise<boolean> => {
    if (!orderId) return false;

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();

      if (error) throw error;

      return data?.status === 'paid';
    } catch (error) {
      console.error('Error checking payment status:', error);
      return false;
    }
  }, [orderId]);

  const handlePaymentConfirmed = () => {
    setStep('success');
  };

  const handleExpire = () => {
    setStep('expired');
  };

  const handleRetry = () => {
    setStep('form');
    setPixData(null);
    setOrderId(null);
  };

  const handleClose = () => {
    // Reset to form only if not logged in
    setStep(user ? 'payment' : 'form');
    setPixData(null);
    setOrderId(null);
    onClose();
  };

  // For logged-in users on payment step, they can go back to form to edit
  const canGoBack = step === 'payment' && !user;

  const handleBack = () => {
    if (step === 'payment' && !user) {
      setStep('form');
    }
  };

  // Calculate total tickets
  const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {canGoBack && (
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
            <h2 className="font-display font-semibold">
              {step === 'form' && 'Seus Dados'}
              {step === 'payment' && 'Pagamento'}
              {step === 'pix' && 'Pagar com PIX'}
              {step === 'awaiting' && 'Aguardando Pagamento'}
              {step === 'success' && 'Sucesso'}
              {step === 'expired' && 'Tempo Esgotado'}
            </h2>
          </div>
          {step !== 'success' && step !== 'awaiting' && (
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>

        {/* Step Indicator */}
        {step !== 'success' && step !== 'expired' && step !== 'awaiting' && (
          <div className="px-4 py-2 bg-secondary/30">
            <div className="flex gap-1">
              {['form', 'payment', 'pix'].map((s, index) => {
                const steps = ['form', 'payment', 'pix'];
                const currentIndex = steps.indexOf(step);
                return (
                  <div
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      index <= currentIndex ? 'bg-primary' : 'bg-secondary'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === 'form' && (
              <CheckoutStepProgressiveForm
                key="form"
                initialData={{
                  cpf: customerData.cpf,
                  name: customerData.name,
                  email: customerData.email,
                  phone: customerData.phone,
                }}
                onComplete={handleFormComplete}
              />
            )}

            {step === 'payment' && (
              <CheckoutStepPayment
                key="payment"
                eventTitle={eventTitle}
                eventDate={eventDate}
                eventTime={eventTime}
                eventVenue={eventVenue}
                items={items}
                totalAmount={totalAmount}
                isProcessing={isProcessing}
                onSelectPayment={handlePaymentSelect}
              />
            )}

            {step === 'pix' && pixData && (
              <CheckoutStepPix
                key="pix"
                pixCode={pixData.code}
                totalAmount={totalAmount}
                expiresAt={pixData.expiresAt}
                onExpire={handleExpire}
                onPaymentConfirmed={() => setStep('awaiting')}
                checkPaymentStatus={checkPaymentStatus}
              />
            )}

            {step === 'awaiting' && orderId && (
              <CheckoutStepAwaitingPayment
                key="awaiting"
                orderId={orderId}
                onPaymentConfirmed={handlePaymentConfirmed}
                checkPaymentStatus={checkPaymentStatus}
              />
            )}

            {step === 'success' && orderId && (
              <CheckoutStepSuccess
                key="success"
                eventTitle={eventTitle}
                ticketCount={totalTickets}
                customerEmail={customerData.email}
                orderId={orderId}
              />
            )}

            {step === 'expired' && (
              <CheckoutStepExpired
                key="expired"
                onRetry={handleRetry}
                onClose={handleClose}
              />
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
