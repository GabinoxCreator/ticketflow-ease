import { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, QrCode, Loader2, Tag, X, CheckCircle2, ArrowRight, Calendar, MapPin, Sparkles, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AppliedCoupon } from './CheckoutModal';

interface CartItem {
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
}

interface CheckoutStepPaymentProps {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventVenue: string;
  items: CartItem[];
  totalAmount: number;
  appliedCoupon: AppliedCoupon | null;
  onApplyCoupon: (c: AppliedCoupon | null) => void;
  isProcessing: boolean;
  onSelectPayment: (method: 'pix' | 'card') => void;
}

export function CheckoutStepPayment({
  eventId,
  eventTitle,
  eventDate,
  eventTime,
  eventVenue,
  items,
  totalAmount,
  appliedCoupon,
  onApplyCoupon,
  isProcessing,
  onSelectPayment,
}: CheckoutStepPaymentProps) {
  const [couponInput, setCouponInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [selecting, setSelecting] = useState<'pix' | 'card' | null>(null);

  const formatPrice = (p: number) =>
    p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (s: string) => {
    const safe = s.length === 10 ? `${s}T12:00:00` : s;
    return new Date(safe).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const SERVICE_FEE_RATE = 0.10;
  const serviceFee = Math.round(totalAmount * SERVICE_FEE_RATE * 100) / 100;
  const finalAmount = Math.max(0, totalAmount - (appliedCoupon?.discountAmount || 0) + serviceFee);

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-coupon', {
        body: { eventId, code: couponInput.trim() },
      });
      if (error) throw error;
      if (!data?.valid) {
        toast.error(data?.message || 'Cupom inválido');
        return;
      }
      const discountAmount =
        data.discountType === 'percent'
          ? (totalAmount * Number(data.discountValue)) / 100
          : Math.min(Number(data.discountValue), totalAmount);
      onApplyCoupon({
        couponId: data.couponId,
        code: data.code,
        discountType: data.discountType,
        discountValue: Number(data.discountValue),
        discountAmount,
      });
      toast.success(`Cupom ${data.code} aplicado!`);
      setCouponInput('');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao validar cupom');
    } finally {
      setValidating(false);
    }
  };

  const handleSelect = (method: 'pix' | 'card') => {
    if (isProcessing || selecting) return;
    setSelecting(method);
    onSelectPayment(method);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Card Resumo Premium */}
      <div className="relative rounded-2xl bg-gradient-to-br from-card/90 to-secondary/40 backdrop-blur-xl border border-border/60 p-5 space-y-4 shadow-xl shadow-primary/5 overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative flex items-start gap-3 pb-4 border-b border-border/50">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <Ticket className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Resumo do pedido</p>
            <p className="font-display font-bold text-base leading-tight truncate">{eventTitle}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(eventDate)} · {eventTime}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{eventVenue}</span>
            </div>
          </div>
        </div>

        <div className="relative space-y-2">
          {items.map((item, idx) => (
            <div key={`${item.lotId}-${idx}`} className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary">
                  {item.quantity}x
                </span>
                <span className="text-foreground/90 truncate">{item.lotName}</span>
              </div>
              <span className="font-medium tabular-nums">{formatPrice(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        {/* Cupom */}
        <div className="relative pt-3 border-t border-border/50">
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/30 px-3 py-2.5 shadow-inner">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{appliedCoupon.code}</p>
                  <p className="text-xs text-emerald-400">−{formatPrice(appliedCoupon.discountAmount)} de desconto</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-emerald-500/20"
                onClick={() => onApplyCoupon(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Cupom de desconto"
                  className="pl-10 h-11 bg-background/60 border-border/60 focus-visible:border-primary/60"
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                />
              </div>
              <Button
                variant="outline"
                onClick={handleApplyCoupon}
                disabled={!couponInput.trim() || validating}
                className="h-11 px-4 border-border/60 hover:border-primary/60"
              >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar'}
              </Button>
            </div>
          )}
        </div>

        <div className="relative space-y-1 pt-1">
          {appliedCoupon && (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-muted-foreground line-through tabular-nums">{formatPrice(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-emerald-400">Desconto</span>
                <span className="text-emerald-400 tabular-nums">−{formatPrice(appliedCoupon.discountAmount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Taxa de serviço (10%)</span>
            <span className="text-muted-foreground tabular-nums">+ {formatPrice(serviceFee)}</span>
          </div>
        </div>

        {/* Total destacado */}
        <div className="relative flex justify-between items-center rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 px-4 py-3 shadow-lg shadow-primary/10">
          <span className="text-sm font-semibold uppercase tracking-wide">Total</span>
          <span className="font-display font-bold text-3xl gradient-text tabular-nums">
            {formatPrice(finalAmount)}
          </span>
        </div>
      </div>

      {/* Forma de pagamento */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
            Como deseja pagar?
          </h3>
        </div>

        <button
          onClick={() => handleSelect('pix')}
          disabled={isProcessing}
          className={cn(
            'group relative w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-300 text-left overflow-hidden',
            'border-border/60 bg-card/60 backdrop-blur',
            'hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5',
            'active:scale-[0.98]',
            selecting === 'pix' && 'border-primary/80 bg-primary/5 shadow-lg shadow-primary/15',
            isProcessing && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-sm">
            <Sparkles className="w-2.5 h-2.5" />
            Recomendado
          </div>
          <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 shadow-inner flex-shrink-0">
            {selecting === 'pix' && isProcessing ? (
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            ) : (
              <QrCode className="w-6 h-6 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base">PIX</p>
            <p className="text-xs text-muted-foreground mt-0.5">Aprovação imediata · Sem taxas</p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
        </button>

        <button
          onClick={() => handleSelect('card')}
          disabled={isProcessing}
          className={cn(
            'group relative w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-300 text-left',
            'border-border/60 bg-card/60 backdrop-blur',
            'hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5',
            'active:scale-[0.98]',
            selecting === 'card' && 'border-primary/80 bg-primary/5 shadow-lg shadow-primary/15',
            isProcessing && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 shadow-inner flex-shrink-0">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base">Cartão de Crédito</p>
            <p className="text-xs text-muted-foreground mt-0.5">Parcele em até 12x · Visa, Master, Elo</p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
        </button>
      </div>
    </motion.div>
  );
}
