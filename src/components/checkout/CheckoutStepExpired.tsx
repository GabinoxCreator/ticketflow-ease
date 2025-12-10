import { motion } from 'framer-motion';
import { Clock, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CheckoutStepExpiredProps {
  onRetry: () => void;
  onClose: () => void;
}

export function CheckoutStepExpired({ onRetry, onClose }: CheckoutStepExpiredProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-6"
    >
      {/* Expired Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.2 }}
        className="w-24 h-24 mx-auto rounded-full bg-destructive/20 flex items-center justify-center"
      >
        <Clock className="w-12 h-12 text-destructive" />
      </motion.div>

      <div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="font-display font-bold text-2xl mb-2"
        >
          Tempo Esgotado
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground"
        >
          O tempo para realizar o pagamento expirou.
          <br />
          A reserva dos ingressos foi liberada.
        </motion.p>
      </div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="space-y-3"
      >
        <Button
          variant="hero"
          size="lg"
          className="w-full"
          onClick={onRetry}
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Tentar Novamente
        </Button>
        
        <Button
          variant="outline"
          className="w-full"
          onClick={onClose}
        >
          <X className="w-5 h-5 mr-2" />
          Fechar
        </Button>
      </motion.div>
    </motion.div>
  );
}
