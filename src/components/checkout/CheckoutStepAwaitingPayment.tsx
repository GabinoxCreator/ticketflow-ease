import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CheckoutStepAwaitingPaymentProps {
  orderId: string;
  onPaymentConfirmed: () => void;
  checkPaymentStatus: () => Promise<boolean>;
}

export function CheckoutStepAwaitingPayment({
  orderId,
  onPaymentConfirmed,
  checkPaymentStatus,
}: CheckoutStepAwaitingPaymentProps) {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      const isPaid = await checkPaymentStatus();
      if (isPaid) {
        onPaymentConfirmed();
      }
    };

    // Check immediately
    checkStatus();

    // Then check every 5 seconds
    const interval = setInterval(checkStatus, 5000);

    return () => clearInterval(interval);
  }, [checkPaymentStatus, onPaymentConfirmed]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 text-center py-4"
    >
      <div className="mx-auto w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center">
        <Clock className="w-10 h-10 text-amber-500 animate-pulse" />
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-xl">Aguardando Confirmação</h3>
        <p className="text-muted-foreground">
          Estamos verificando o pagamento do seu pedido
        </p>
      </div>

      <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Verificando pagamento...</span>
        </div>
        
        <p className="text-xs text-muted-foreground">
          Pedido: <span className="font-mono">{orderId.slice(0, 8)}...</span>
        </p>
      </div>

      <div className="bg-primary/5 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          A confirmação pode levar alguns minutos após o pagamento ser processado.
          Você receberá um email assim que o pagamento for confirmado.
        </p>
      </div>
    </motion.div>
  );
}
