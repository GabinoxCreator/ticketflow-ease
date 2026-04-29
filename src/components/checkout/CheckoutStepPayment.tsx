import { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, QrCode, Loader2, Tag, X, CheckCircle2 } from 'lucide-react';
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

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  const finalAmount = Math.max(0, totalAmount - (appliedCoupon?.discountAmount || 0));

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
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-5"
    >
      {/* Resumo */}
      <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">
          Resumo do pedido
        </h3>

        <div className="border-b border-border pb-3">
          <p className="font-display font-bold text-lg leading-tight">{eventTitle}</p>
          <p className="text-sm text-muted-foreground">
            {formatDate(eventDate)} às {eventTime} • {eventVenue}
          </p>
        </div>

        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <div key={`${item.lotId}-${idx}`} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.quantity}x {item.lotName}</span>
              <span>{formatPrice(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        {/* Cupom */}
        <div className="border-t border-border pt-3 space-y-2">
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{appliedCoupon.code}</p>
                  <p className="text-xs text-green-500">-{formatPrice(appliedCoupon.discountAmount)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onApplyCoupon(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Cupom de desconto"
                  className="pl-9 h-10"
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                />
              </div>
              <Button
                variant="outline"
                onClick={handleApplyCoupon}
                disabled={!couponInput.trim() || validating}
              >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar'}
              </Button>
            </div>
          )}
        </div>

        {appliedCoupon && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-muted-foreground">{formatPrice(totalAmount)}</span>
          </div>
        )}
        {appliedCoupon && (
          <div className="flex justify-between text-sm">
            <span className="text-green-500">Desconto</span>
            <span className="text-green-500">-{formatPrice(appliedCoupon.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="font-semibold">Total</span>
          <span className="font-display font-bold text-2xl gradient-text">
            {formatPrice(finalAmount)}
          </span>
        </div>
      </div>

      {/* Forma de pagamento */}
      <div className="space-y-3">
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">
          Forma de pagamento
        </h3>

        <button
          onClick={() => handleSelect('pix')}
          disabled={isProcessing}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left',
            'border-border hover:border-primary hover:bg-primary/5 active:scale-[0.98]',
            selecting === 'pix' && 'border-primary bg-primary/5',
            isProcessing && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-secondary">
            {selecting === 'pix' && isProcessing ? (
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            ) : (
              <QrCode className="w-6 h-6 text-primary" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-semibold">PIX</p>
            <p className="text-sm text-muted-foreground">Pagamento instantâneo • Aprovação imediata</p>
          </div>
        </button>

        <button
          onClick={() => handleSelect('card')}
          disabled={isProcessing}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left',
            'border-border hover:border-primary hover:bg-primary/5 active:scale-[0.98]',
            selecting === 'card' && 'border-primary bg-primary/5',
            isProcessing && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-secondary">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Cartão de Crédito</p>
            <p className="text-sm text-muted-foreground">Parcele em até 12x • Visa, Master, Elo</p>
          </div>
        </button>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Selecione a forma de pagamento para continuar
      </p>
    </motion.div>
  );
}
