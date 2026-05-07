import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Loader2, Lock, User, Calendar, Shield, IdCard, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

declare global {
  interface Window {
    MercadoPago: any;
  }
}

interface CartItem {
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
}

interface CheckoutStepCardProps {
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
  onInProcess?: (orderId: string, paymentId?: string) => void;
  onError: (message: string) => void;
}

interface Installment {
  installments: number;
  installment_amount: number;
  total_amount: number;
  recommended_message: string;
}

const CARD_ERROR_MESSAGES: Record<string, string> = {
  cc_rejected_insufficient_amount: 'Saldo insuficiente no cartão.',
  cc_rejected_bad_filled_security_code: 'Código de segurança incorreto.',
  cc_rejected_bad_filled_date: 'Data de validade incorreta.',
  cc_rejected_bad_filled_other: 'Dados do cartão incorretos.',
  cc_rejected_high_risk: 'Pagamento recusado por medida de segurança.',
  cc_rejected_call_for_authorize: 'Ligue para a operadora do cartão para autorizar.',
  cc_rejected_card_disabled: 'Cartão desabilitado. Ligue para a operadora.',
  cc_rejected_max_attempts: 'Limite de tentativas excedido. Tente outro cartão.',
};

export function CheckoutStepCard({
  eventId,
  eventTitle,
  items,
  totalAmount,
  couponId,
  customerName,
  customerEmail,
  customerPhone,
  customerCPF,
  onSuccess,
  onInProcess,
  onError,
}: CheckoutStepCardProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(customerName);
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cpf, setCpf] = useState(customerCPF);
  const [installments, setInstallments] = useState('1');
  const [installmentOptions, setInstallmentOptions] = useState<Installment[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [issuerId, setIssuerId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardBrand, setCardBrand] = useState('');
  const [mpReady, setMpReady] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    const fetchPublicKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mercadopago-public-key');
        if (error) throw error;
        if (data?.publicKey) setPublicKey(data.publicKey);
      } catch (err) {
        console.error('Error fetching MP public key:', err);
      }
    };
    fetchPublicKey();
  }, []);

  useEffect(() => {
    if (!publicKey) return;
    const checkMP = () => {
      if (window.MercadoPago) setMpReady(true);
      else setTimeout(checkMP, 200);
    };
    checkMP();
  }, [publicKey]);

  const formatCardNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 16);
    return numbers.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const formatExpiry = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 4);
    if (numbers.length > 2) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    return numbers;
  };

  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 11);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
  };

  const formatPrice = (price: number) =>
    price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const detectCardBrand = useCallback(async (bin: string) => {
    if (!mpReady || bin.length < 6) return;
    try {
      const mp = new window.MercadoPago(publicKey);
      const result = await mp.getPaymentMethods({ bin });
      if (result.results?.length > 0) {
        const method = result.results[0];
        setPaymentMethodId(method.id);
        setIssuerId(method.issuer?.id?.toString() || '');
        setCardBrand(method.name);
      }
    } catch (err) {
      console.error('Error detecting card brand:', err);
    }
  }, [mpReady, publicKey]);

  useEffect(() => {
    if (!mpReady || !paymentMethodId || totalAmount <= 0) return;
    const fetchInstallments = async () => {
      try {
        const mp = new window.MercadoPago(publicKey);
        const result = await mp.getInstallments({
          amount: String(totalAmount),
          bin: cardNumber.replace(/\s/g, '').slice(0, 6),
          payment_method_id: paymentMethodId,
        });
        if (result?.length > 0 && result[0].payer_costs) {
          setInstallmentOptions(result[0].payer_costs.map((pc: any) => ({
            installments: pc.installments,
            installment_amount: pc.installment_amount,
            total_amount: pc.total_amount,
            recommended_message: pc.recommended_message,
          })));
        }
      } catch (err) {
        console.error('Error fetching installments:', err);
        setInstallmentOptions([{
          installments: 1,
          installment_amount: totalAmount,
          total_amount: totalAmount,
          recommended_message: `1x de ${formatPrice(totalAmount)} (sem juros)`,
        }]);
      }
    };
    fetchInstallments();
  }, [mpReady, paymentMethodId, totalAmount, publicKey, cardNumber]);

  const handleCardNumberChange = (value: string) => {
    const formatted = formatCardNumber(value);
    setCardNumber(formatted);
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 6) detectCardBrand(digits.slice(0, 6));
    else {
      setCardBrand('');
      setPaymentMethodId('');
      setInstallmentOptions([]);
    }
  };

  const handleSubmit = async () => {
    if (!mpReady) {
      toast.error('SDK de pagamento não carregado. Tente novamente.');
      return;
    }
    const cleanCard = cardNumber.replace(/\s/g, '');
    const [expMonth, expYear] = expiryDate.split('/');
    const cleanCPF = cpf.replace(/\D/g, '');

    if (cleanCard.length < 13 || !expMonth || !expYear || cvv.length < 3 || !cardHolder.trim() || cleanCPF.length !== 11) {
      toast.error('Preencha todos os campos corretamente.');
      return;
    }

    setIsProcessing(true);
    try {
      const mp = new window.MercadoPago(publicKey);
      const tokenResult = await mp.createCardToken({
        cardNumber: cleanCard,
        cardholderName: cardHolder,
        cardExpirationMonth: expMonth,
        cardExpirationYear: `20${expYear}`,
        securityCode: cvv,
        identificationType: 'CPF',
        identificationNumber: cleanCPF,
      });
      if (!tokenResult?.id) throw new Error('Erro ao tokenizar cartão');

      const { data, error } = await supabase.functions.invoke('process-card-payment', {
        body: {
          eventId,
          items: items.map(i => ({ lotId: i.lotId, quantity: i.quantity })),
          customerName,
          customerEmail,
          customerPhone,
          customerCPF: cleanCPF,
          cardToken: tokenResult.id,
          paymentMethodId,
          issuerId,
          installments: parseInt(installments),
          couponId,
        },
      });

      if (error) throw error;
      if (data?.error) {
        const friendlyMsg = CARD_ERROR_MESSAGES[data.errorCode] || data.error;
        throw new Error(friendlyMsg);
      }
      if (data?.status === 'approved') onSuccess(data.orderId);
      else if (data?.status === 'in_process') {
        toast.info('Pagamento em análise. Aguarde a confirmação.');
        if (onInProcess) onInProcess(data.orderId);
        else onSuccess(data.orderId);
      } else {
        const friendlyMsg = CARD_ERROR_MESSAGES[data?.errorCode] || 'Pagamento não aprovado. Tente outro cartão.';
        throw new Error(friendlyMsg);
      }
    } catch (err: any) {
      console.error('Card payment error:', err);
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
      {/* Total premium */}
      <div className="relative rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 p-4 shadow-lg shadow-primary/10 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 border border-primary/40 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total a pagar</p>
              <p className="text-xs text-foreground/80 truncate">{eventTitle}</p>
            </div>
          </div>
          <span className="font-display font-bold text-2xl gradient-text flex-shrink-0 tabular-nums">
            {formatPrice(totalAmount)}
          </span>
        </div>
      </div>

      {/* Card Form */}
      <div className="space-y-3.5">
        <div>
          <Label htmlFor="card-number" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Número do cartão
          </Label>
          <div className="relative mt-1.5">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input
              id="card-number"
              value={cardNumber}
              onChange={(e) => handleCardNumberChange(e.target.value)}
              placeholder="0000 0000 0000 0000"
              maxLength={19}
              className="pl-10 h-12 bg-background/60 border-border/60 focus-visible:border-primary/60"
              inputMode="numeric"
            />
            {cardBrand && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                {cardBrand}
              </span>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="card-holder" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Nome do titular
          </Label>
          <div className="relative mt-1.5">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input
              id="card-holder"
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
              placeholder="NOME COMO NO CARTÃO"
              className="pl-10 h-12 bg-background/60 border-border/60 focus-visible:border-primary/60"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="expiry" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Validade
            </Label>
            <div className="relative mt-1.5">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
              <Input
                id="expiry"
                value={expiryDate}
                onChange={(e) => setExpiryDate(formatExpiry(e.target.value))}
                placeholder="MM/AA"
                maxLength={5}
                className="pl-10 h-12 bg-background/60 border-border/60 focus-visible:border-primary/60"
                inputMode="numeric"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="cvv" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              CVV
            </Label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
              <Input
                id="cvv"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="123"
                maxLength={4}
                className="pl-10 h-12 bg-background/60 border-border/60 focus-visible:border-primary/60"
                inputMode="numeric"
                type="password"
              />
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="cpf-card" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            CPF do titular
          </Label>
          <div className="relative mt-1.5">
            <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input
              id="cpf-card"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              placeholder="000.000.000-00"
              maxLength={14}
              className="pl-10 h-12 bg-background/60 border-border/60 focus-visible:border-primary/60"
              inputMode="numeric"
            />
          </div>
        </div>

        {installmentOptions.length > 0 && (
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Parcelas
            </Label>
            <Select value={installments} onValueChange={setInstallments}>
              <SelectTrigger className="mt-1.5 h-12 bg-background/60 border-border/60">
                <SelectValue placeholder="Selecione as parcelas" />
              </SelectTrigger>
              <SelectContent>
                {installmentOptions.map((opt) => (
                  <SelectItem key={opt.installments} value={String(opt.installments)}>
                    {opt.recommended_message}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Button
        variant="hero"
        size="lg"
        className="w-full h-14 text-base font-semibold"
        onClick={handleSubmit}
        disabled={isProcessing || !mpReady}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Processando pagamento...
          </>
        ) : (
          <>
            <Lock className="w-4 h-4 mr-2" />
            Pagar {formatPrice(totalAmount)}
          </>
        )}
      </Button>

      {/* Trust badges */}
      <div className="flex items-center justify-center gap-4 pt-1">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Lock className="w-3 h-3 text-primary" />
          <span>SSL 256-bit</span>
        </div>
        <span className="w-1 h-1 rounded-full bg-border" />
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Shield className="w-3 h-3 text-primary" />
          <span>Mercado Pago</span>
        </div>
      </div>
    </motion.div>
  );
}
