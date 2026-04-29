import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Copy, CheckCircle2, RefreshCw } from 'lucide-react';
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

  const formatPrice = (p: number) =>
    p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
    } catch {
      toast.error('Erro ao copiar código');
    }
  };

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      const isPaid = await checkPaymentStatus();
      if (isPaid) onPaymentConfirmed();
      else toast.info('Pagamento ainda não confirmado');
    } catch {
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
      className="space-y-5"
    >
      {/* Valor + timer */}
      <div className="text-center space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor a pagar</p>
        <p className="font-display font-bold text-3xl gradient-text">{formatPrice(totalAmount)}</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">Expira em</span>
          <CheckoutTimer expiresAt={expiresAt} onExpire={onExpire} />
        </div>
      </div>

      {/* QR Code */}
      <div className="flex justify-center">
        <div className="bg-white p-4 rounded-2xl shadow-xl">
          <QRCodeSVG value={pixCode} size={220} level="M" includeMargin={false} />
        </div>
      </div>

      {/* Copiar PIX */}
      <Button
        variant={copied ? 'outline' : 'hero'}
        size="lg"
        className="w-full"
        onClick={handleCopy}
      >
        {copied ? (
          <>
            <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" />
            Código copiado!
          </>
        ) : (
          <>
            <Copy className="w-5 h-5 mr-2" />
            Copiar código PIX
          </>
        )}
      </Button>

      <div className="bg-secondary/40 rounded-lg p-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">PIX Copia e Cola</p>
        <p className="text-xs font-mono break-all line-clamp-2 text-muted-foreground">{pixCode}</p>
      </div>

      {/* Instruções enxutas */}
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold">1</span>
          Abra o app do seu banco e escolha pagar via PIX
        </div>
        <div className="flex items-start gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold">2</span>
          Cole o código copiado ou escaneie o QR Code
        </div>
        <div className="flex items-start gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold">3</span>
          Confirme o valor e finalize o pagamento
        </div>
      </div>

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
