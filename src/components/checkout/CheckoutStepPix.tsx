import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Copy, CheckCircle2, QrCode, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { CheckoutTimer } from './CheckoutTimer';
import { toast } from 'sonner';

interface CheckoutStepPixProps {
  pixCode: string;
  totalAmount: number;
  expiresAt: Date;
  onExpire: () => void;
  onPaymentConfirmed: () => void;
  checkPaymentStatus: () => Promise<boolean>;
}

export function CheckoutStepPix({
  pixCode,
  totalAmount,
  expiresAt,
  onExpire,
  onPaymentConfirmed,
  checkPaymentStatus,
}: CheckoutStepPixProps) {
  const [copied, setCopied] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  // Poll for payment status every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const isPaid = await checkPaymentStatus();
        if (isPaid) {
          clearInterval(interval);
          onPaymentConfirmed();
        }
      } catch (error) {
        console.error('Error checking payment status:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [checkPaymentStatus, onPaymentConfirmed]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopied(true);
      toast.success('Código PIX copiado!');
      setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      toast.error('Erro ao copiar código');
    }
  };

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      const isPaid = await checkPaymentStatus();
      if (isPaid) {
        onPaymentConfirmed();
      } else {
        toast.info('Pagamento ainda não confirmado');
      }
    } catch (error) {
      toast.error('Erro ao verificar pagamento');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* Timer */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted-foreground">Tempo restante para pagamento</p>
        <CheckoutTimer expiresAt={expiresAt} onExpire={onExpire} />
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center">
        <div className="bg-white p-4 rounded-2xl shadow-lg">
          <QRCodeSVG
            value={pixCode}
            size={200}
            level="H"
            includeMargin
            imageSettings={{
              src: '/favicon.ico',
              height: 24,
              width: 24,
              excavate: true,
            }}
          />
        </div>
        
        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground">Escaneie o QR Code ou</p>
          <p className="text-sm text-muted-foreground">copie o código PIX abaixo</p>
        </div>
      </div>

      {/* PIX Code Copy */}
      <div className="space-y-2">
        <div className="relative">
          <div className="bg-secondary/50 rounded-xl p-4 pr-12 overflow-hidden">
            <p className="text-xs text-muted-foreground mb-1">Código PIX (Copia e Cola)</p>
            <p className="text-sm font-mono break-all line-clamp-2">{pixCode}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={handleCopy}
          >
            {copied ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <Copy className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Amount Summary */}
      <div className="bg-primary/10 rounded-xl p-4 text-center">
        <p className="text-sm text-muted-foreground">Valor a pagar</p>
        <p className="font-display font-bold text-3xl gradient-text">
          {formatPrice(totalAmount)}
        </p>
      </div>

      {/* Instructions */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">Como pagar:</h4>
        <ol className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold">1</span>
            Abra o app do seu banco
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold">2</span>
            Escolha pagar via PIX com QR Code ou código
          </li>
          <li className="flex items-start gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold">3</span>
            Confirme as informações e finalize
          </li>
        </ol>
      </div>

      {/* Manual Check Button */}
      <Button
        variant="outline"
        className="w-full"
        onClick={handleManualCheck}
        disabled={isChecking}
      >
        {isChecking ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Verificando...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Já paguei, verificar
          </>
        )}
      </Button>
    </motion.div>
  );
}
