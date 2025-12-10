import { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, QrCode, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CartItem {
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
}

interface CheckoutStepPaymentProps {
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventVenue: string;
  items: CartItem[];
  totalAmount: number;
  isProcessing: boolean;
  onSelectPayment: (method: 'pix' | 'card') => void;
}

export function CheckoutStepPayment({
  eventTitle,
  eventDate,
  eventTime,
  eventVenue,
  items,
  totalAmount,
  isProcessing,
  onSelectPayment,
}: CheckoutStepPaymentProps) {
  const [selectedMethod, setSelectedMethod] = useState<'pix' | 'card' | null>(null);

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  };

  const handleContinue = () => {
    if (selectedMethod) {
      onSelectPayment(selectedMethod);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* Order Summary */}
      <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Resumo do pedido
        </h3>
        
        <div className="border-b border-border pb-3">
          <p className="font-display font-bold text-lg">{eventTitle}</p>
          <p className="text-sm text-muted-foreground">
            {formatDate(eventDate)} às {eventTime} • {eventVenue}
          </p>
        </div>

        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.lotId} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {item.quantity}x {item.lotName}
              </span>
              <span>{formatPrice(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-3 flex justify-between items-center">
          <span className="font-semibold">Total</span>
          <span className="font-display font-bold text-2xl gradient-text">
            {formatPrice(totalAmount)}
          </span>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Forma de pagamento
        </h3>

        <button
          onClick={() => setSelectedMethod('pix')}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left',
            selectedMethod === 'pix'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground'
          )}
        >
          <div className={cn(
            'w-12 h-12 rounded-lg flex items-center justify-center',
            selectedMethod === 'pix' ? 'bg-primary/20' : 'bg-secondary'
          )}>
            <QrCode className={cn(
              'w-6 h-6',
              selectedMethod === 'pix' ? 'text-primary' : 'text-muted-foreground'
            )} />
          </div>
          <div className="flex-1">
            <p className="font-semibold">PIX</p>
            <p className="text-sm text-muted-foreground">
              Pagamento instantâneo • Aprovação imediata
            </p>
          </div>
          {selectedMethod === 'pix' && (
            <Check className="w-5 h-5 text-primary" />
          )}
        </button>

        <button
          onClick={() => setSelectedMethod('card')}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left',
            selectedMethod === 'card'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground'
          )}
        >
          <div className={cn(
            'w-12 h-12 rounded-lg flex items-center justify-center',
            selectedMethod === 'card' ? 'bg-primary/20' : 'bg-secondary'
          )}>
            <CreditCard className={cn(
              'w-6 h-6',
              selectedMethod === 'card' ? 'text-primary' : 'text-muted-foreground'
            )} />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Cartão de Crédito</p>
            <p className="text-sm text-muted-foreground">
              Parcele em até 12x • Visa, Master, Elo
            </p>
          </div>
          {selectedMethod === 'card' && (
            <Check className="w-5 h-5 text-primary" />
          )}
        </button>
      </div>

      <Button
        variant="hero"
        size="lg"
        className="w-full"
        disabled={!selectedMethod || isProcessing}
        onClick={handleContinue}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Processando...
          </>
        ) : (
          <>
            Finalizar Compra
            <ArrowRight className="w-5 h-5 ml-2" />
          </>
        )}
      </Button>
    </motion.div>
  );
}
