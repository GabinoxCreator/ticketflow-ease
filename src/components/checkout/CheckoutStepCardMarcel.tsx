import { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Loader2, Lock, User, Calendar, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CartItem {
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
}

interface CheckoutStepCardMarcelProps {
  eventId: string;
  eventTitle: string;
  items: CartItem[];
  totalAmount: number;
  couponId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCPF: string;
  onSuccess: (orderId: string, paymentId?: string) => void;
  onError: (message: string) => void;
}

export function CheckoutStepCardMarcel({
  eventId,
  items,
  totalAmount,
  couponId,
  customerName,
  customerEmail,
  customerPhone,
  customerCPF,
  onSuccess,
  onError,
}: CheckoutStepCardMarcelProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(customerName);
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const formatPrice = (price: number) =>
    price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatCardNumber = (value: string) =>
    value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');

  const formatExpiry = (value: string) => {
    const n = value.replace(/\D/g, '').slice(0, 4);
    return n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
  };

  const handleSubmit = async () => {
    const cleanCard = cardNumber.replace(/\s/g, '');
    const [expMonth, expYear] = expiryDate.split('/');

    if (cleanCard.length < 13 || !expMonth || !expYear || cvv.length < 3 || !cardHolder.trim()) {
      toast.error('Preencha todos os campos corretamente.');
      return;
    }

    setIsProcessing(true);
    try {
      const expiration = `${expMonth}/20${expYear}`;

      const { data, error } = await supabase.functions.invoke('confra-process-card', {
        body: {
          eventId,
          items: items.map(i => ({ lotId: i.lotId, quantity: i.quantity })),
          customerName,
          customerEmail,
          customerPhone,
          customerCPF: customerCPF.replace(/\D/g, ''),
          couponId,
          card: {
            holder: cardHolder.trim(),
            number: cleanCard,
            expiration,
            cvv,
          },
        },
      });

      if (error) throw error;
      if (data?.status === 'approved') {
        onSuccess(data.orderId);
      } else {
        throw new Error(data?.error || 'Pagamento não aprovado. Tente outro cartão.');
      }
    } catch (err: any) {
      console.error('Card payment error (Marcel):', err);
      const msg = err.message || 'Erro ao processar pagamento';
      toast.error(msg);
      onError(msg);
    } finally {
      setIsProcessing(false);
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
      <div className="text-center space-y-1 py-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Valor a pagar</p>
        <p className="font-display font-bold text-4xl gradient-text tabular-nums">{formatPrice(totalAmount)}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="m-cardNumber">Número do cartão</Label>
        <div className="relative">
          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input id="m-cardNumber" inputMode="numeric" placeholder="0000 0000 0000 0000" className="pl-10"
            value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="m-cardHolder">Nome no cartão</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input id="m-cardHolder" placeholder="Como está no cartão" className="pl-10"
            value={cardHolder} onChange={(e) => setCardHolder(e.target.value.toUpperCase())} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="m-expiry">Validade</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="m-expiry" inputMode="numeric" placeholder="MM/AA" className="pl-10"
              value={expiryDate} onChange={(e) => setExpiryDate(formatExpiry(e.target.value))} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="m-cvv">CVV</Label>
          <div className="relative">
            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="m-cvv" inputMode="numeric" placeholder="000" className="pl-10" maxLength={4}
              value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </div>
        </div>
      </div>

      <Button variant="hero" size="lg" className="w-full h-14 text-base font-semibold"
        onClick={handleSubmit} disabled={isProcessing}>
        {isProcessing ? (
          <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processando...</>
        ) : (
          <><Lock className="w-5 h-5 mr-2" /> Pagar {formatPrice(totalAmount)}</>
        )}
      </Button>

      <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" /> Pagamento processado com segurança
      </p>
    </motion.div>
  );
}
