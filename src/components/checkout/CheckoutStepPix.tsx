import { useState, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import { Copy, CheckCircle2, RefreshCw, Clock, Smartphone, ScanLine, BadgeCheck } from 'lucide-react';
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

// Memoized QR — heavy SVG generation, must not re-render on parent state changes
const PixQrCode = memo(({ value }: { value: string }) => (
  <QRCodeSVG value={value} size={200} level="M" includeMargin={false} />
));
PixQrCode.displayName = 'PixQrCode';

function copyToClipboardFallback(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
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

  // Polling com guarda de concorrência + setTimeout recursivo (nunca empilha)
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const tick = async () => {
      if (cancelled) return;
      if (inFlight) {
        timeoutId = setTimeout(tick, 5000);
        return;
      }
      inFlight = true;
      try {
        const isPaid = await checkPaymentStatus();
        if (cancelled) return;
        if (isPaid) {
          onPaymentConfirmed();
          return;
        }
      } catch (error) {
        console.error('Error checking payment status:', error);
      } finally {
        inFlight = false;
      }
      if (!cancelled) timeoutId = setTimeout(tick, 5000);
    };

    timeoutId = setTimeout(tick, 5000);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [checkPaymentStatus, onPaymentConfirmed]);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);

    const doCopy = () => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(pixCode).catch(() => {
          if (!copyToClipboardFallback(pixCode)) {
            toast.error('Não foi possível copiar. Selecione o código manualmente.');
          }
        });
      } else if (!copyToClipboardFallback(pixCode)) {
        toast.error('Não foi possível copiar. Selecione o código manualmente.');
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => setTimeout(doCopy, 0));
    } else {
      setTimeout(doCopy, 0);
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Valor com glow */}
      <div className="relative text-center space-y-2 py-2">
        <div className="absolute inset-x-0 top-0 mx-auto w-56 h-32 bg-primary/25 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute inset-x-0 top-0 mx-auto w-40 h-24 bg-accent/20 blur-3xl rounded-full pointer-events-none" />
        <p className="relative text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
          Valor a pagar
        </p>
        <p className="relative font-display font-bold text-4xl gradient-text tabular-nums">
          {formatPrice(totalAmount)}
        </p>
        <div className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/60 backdrop-blur border border-border/60">
          <Clock className="w-3 h-3 text-primary" />
          <span className="text-[11px] text-muted-foreground">Expira em</span>
          <CheckoutTimer expiresAt={expiresAt} onExpire={onExpire} />
        </div>
      </div>

      {/* QR Code premium */}
      <div className="flex justify-center">
        <div className="relative">
          {/* Glow */}
          <div className="absolute -inset-4 bg-gradient-to-br from-primary/30 to-accent/30 rounded-3xl blur-2xl opacity-60" />
          {/* Borda gradient */}
          <div className="relative p-[2px] rounded-3xl bg-gradient-to-br from-primary via-accent to-primary shadow-2xl shadow-primary/20">
            <div className="bg-white p-4 rounded-[22px]">
              <PixQrCode value={pixCode} />
            </div>
          </div>
          {/* Corner brackets */}
          <span className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-primary rounded-tl-lg" />
          <span className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-accent rounded-tr-lg" />
          <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-accent rounded-bl-lg" />
          <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-primary rounded-br-lg" />
        </div>
      </div>

      {/* Copiar PIX */}
      <Button
        variant={copied ? 'outline' : 'hero'}
        size="lg"
        className="w-full h-14 text-base font-semibold"
        onClick={handleCopy}
      >
        {copied ? (
          <>
            <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-400" />
            Código copiado!
          </>
        ) : (
          <>
            <Copy className="w-5 h-5 mr-2" />
            Copiar código PIX
          </>
        )}
      </Button>

      <div className="rounded-xl bg-card/60 backdrop-blur border border-border/60 p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            PIX Copia e Cola
          </p>
          <button
            onClick={handleCopy}
            className="text-[10px] text-primary hover:text-accent transition-colors flex items-center gap-1"
          >
            <Copy className="w-3 h-3" />
            Copiar
          </button>
        </div>
        <p className="text-xs font-mono break-all line-clamp-2 text-muted-foreground">{pixCode}</p>
      </div>

      {/* Instruções premium */}
      <div className="rounded-xl bg-gradient-to-br from-card/80 to-secondary/30 backdrop-blur border border-border/60 p-4 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Como pagar
        </p>
        {[
          { icon: Smartphone, text: 'Abra o app do seu banco e escolha pagar via PIX' },
          { icon: ScanLine, text: 'Escaneie o QR Code ou cole o código copiado' },
          { icon: BadgeCheck, text: 'Confirme o valor e finalize o pagamento' },
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
              <span className="text-[10px] font-bold text-primary-foreground absolute -top-1 -right-1 w-4 h-4 rounded-full bg-background border border-primary flex items-center justify-center">
                {i + 1}
              </span>
              <step.icon className="w-4 h-4 text-primary-foreground" />
            </div>
            <p className="text-xs text-foreground/80 flex-1">{step.text}</p>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full h-12 border-border/60 hover:border-primary/60"
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
