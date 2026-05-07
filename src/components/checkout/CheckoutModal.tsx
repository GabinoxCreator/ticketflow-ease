import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckoutStepProgressiveForm } from './CheckoutStepProgressiveForm';
import { CheckoutStepCPF } from './CheckoutStepCPF';
import { CheckoutStepPayment } from './CheckoutStepPayment';
import { CheckoutStepCard } from './CheckoutStepCard';
import { CheckoutStepPix } from './CheckoutStepPix';
import { CheckoutStepAwaitingPayment } from './CheckoutStepAwaitingPayment';
import { CheckoutStepSuccess } from './CheckoutStepSuccess';
import { CheckoutStepExpired } from './CheckoutStepExpired';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { validateCPF, unformatCPF } from '@/utils/cpfValidator';

type CheckoutStep = 'form' | 'cpf' | 'payment' | 'card' | 'pix' | 'awaiting' | 'success' | 'expired';

interface CartItem {
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
}

export interface AppliedCoupon {
  couponId: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  discountAmount: number;
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
  const isMobile = useIsMobile();
  const [step, setStep] = useState<CheckoutStep>('payment');
  const [customerData, setCustomerData] = useState({
    cpf: '',
    name: '',
    email: '',
    phone: '',
  });
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{ code: string; expiresAt: Date } | null>(null);

  const finalAmount = Math.max(0, totalAmount - (appliedCoupon?.discountAmount || 0));

  useEffect(() => {
    if (isOpen) {
      setCustomerData({
        cpf: '',
        name: profile?.nome_completo || user?.user_metadata?.nome_completo || '',
        email: user?.email || '',
        phone: profile?.whatsapp || '',
      });
      setStep('payment');
    }
  }, [user, isOpen, profile]);

  const handleFormComplete = (data: { cpf: string; name: string; email: string; phone: string }) => {
    setCustomerData(data);
    setStep('payment');
  };

  const handlePaymentSelect = async (method: 'pix' | 'card') => {
    if (method === 'card') {
      setStep('card');
      return;
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-mercadopago-pix', {
        body: {
          eventId,
          items: items.map(item => ({ lotId: item.lotId, quantity: item.quantity })),
          customerName: customerData.name,
          customerEmail: customerData.email,
          customerCPF: customerData.cpf,
          customerPhone: customerData.phone,
          couponId: appliedCoupon?.couponId,
        },
      });
      if (error) throw error;
      setOrderId(data.orderId);
      setPixData({ code: data.pixCode, expiresAt: new Date(data.expiresAt) });
      setStep('pix');
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
      const { data, error } = await supabase.functions.invoke('check-mercadopago-payment', {
        body: { orderId, paymentId },
      });
      if (error) throw error;
      return data?.paid === true;
    } catch (error) {
      console.error('Error checking payment status:', error);
      return false;
    }
  }, [orderId, paymentId]);

  const handlePaymentConfirmed = () => setStep('success');
  const handleExpire = () => setStep('expired');
  const handleRetry = () => { setStep('payment'); setPixData(null); setOrderId(null); };

  const handleClose = () => {
    setStep('payment');
    setPixData(null);
    setOrderId(null);
    setAppliedCoupon(null);
    onClose();
  };

  const handleBack = () => {
    if (step === 'card' || step === 'pix') {
      setStep('payment');
    } else if (step === 'payment') {
      handleClose();
    }
  };

  const canGoBack = step === 'payment' || step === 'card' || step === 'pix';
  const showHeader = step !== 'success';
  const showTrust = step === 'payment' || step === 'card' || step === 'pix';
  const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);

  const titleByStep: Record<CheckoutStep, string> = {
    form: 'Seus Dados',
    payment: 'Pagamento',
    card: 'Cartão de Crédito',
    pix: 'Pagar com PIX',
    awaiting: 'Aguardando Pagamento',
    success: 'Sucesso',
    expired: 'Tempo Esgotado',
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden flex flex-col [&>button]:hidden bg-background',
          isMobile
            ? 'max-w-none w-screen h-[100dvh] rounded-none border-0 sm:max-w-none top-0 left-0 translate-x-0 translate-y-0'
            : 'sm:max-w-md max-h-[90vh]'
        )}
      >
        {/* Decoração de fundo - gradient sutil indigo/magenta */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-20 w-80 h-80 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-accent/10 blur-3xl" />
        </div>

        {showHeader && (
          <div className="relative flex items-center justify-center px-4 h-16 border-b border-border/50 flex-shrink-0 backdrop-blur-xl bg-background/60 z-10">
            {canGoBack ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full hover:bg-secondary/60"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            ) : null}
            <h2 className="font-display font-bold text-base tracking-tight">{titleByStep[step]}</h2>
            {step !== 'awaiting' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full hover:bg-secondary/60"
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>
        )}

        <div className="relative flex-1 overflow-y-auto px-5 py-6 z-10">
          <AnimatePresence mode="wait">
            {step === 'form' && (
              <CheckoutStepProgressiveForm
                key="form"
                initialData={customerData}
                onComplete={handleFormComplete}
              />
            )}

            {step === 'payment' && (
              <CheckoutStepPayment
                key="payment"
                eventId={eventId}
                eventTitle={eventTitle}
                eventDate={eventDate}
                eventTime={eventTime}
                eventVenue={eventVenue}
                items={items}
                totalAmount={totalAmount}
                appliedCoupon={appliedCoupon}
                onApplyCoupon={setAppliedCoupon}
                isProcessing={isProcessing}
                onSelectPayment={handlePaymentSelect}
              />
            )}

            {step === 'card' && (
              <CheckoutStepCard
                key="card"
                eventId={eventId}
                eventTitle={eventTitle}
                items={items}
                totalAmount={finalAmount}
                couponId={appliedCoupon?.couponId}
                customerName={customerData.name}
                customerEmail={customerData.email}
                customerPhone={customerData.phone}
                customerCPF={customerData.cpf}
                onSuccess={(newOrderId) => { setOrderId(newOrderId); setStep('success'); }}
                onError={() => {}}
              />
            )}

            {step === 'pix' && pixData && (
              <CheckoutStepPix
                key="pix"
                pixCode={pixData.code}
                totalAmount={finalAmount}
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

        {showTrust && (
          <div className="relative flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-border/50 bg-background/60 backdrop-blur-xl flex-shrink-0 z-10">
            <ShieldCheck className="w-3 h-3 text-primary" />
            <p className="text-[10px] text-muted-foreground tracking-wide">
              Pagamento 100% seguro · Criptografia SSL
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
