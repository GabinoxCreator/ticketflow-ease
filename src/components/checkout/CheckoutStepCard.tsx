import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Loader2, Lock, AlertCircle } from 'lucide-react';
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
  onSuccess: (orderId: string) => void;
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

  // Fetch MercadoPago public key from backend
  useEffect(() => {
    const fetchPublicKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mercadopago-public-key');
        if (error) throw error;
        if (data?.publicKey) {
          setPublicKey(data.publicKey);
        }
      } catch (err) {
        console.error('Error fetching MP public key:', err);
      }
    };
    fetchPublicKey();
  }, []);

  // Initialize MercadoPago SDK
  useEffect(() => {
    if (!publicKey) return;
    const checkMP = () => {
      if (window.MercadoPago) {
        setMpReady(true);
      } else {
        setTimeout(checkMP, 200);
      }
    };
    checkMP();
  }, [publicKey]);

  // Format card number with spaces
  const formatCardNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 16);
    return numbers.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  // Format expiry MM/YY
  const formatExpiry = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 4);
    if (numbers.length > 2) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    return numbers;
  };

  // Format CPF
  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 11);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Detect card brand when 6+ digits entered
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

  // Fetch installments when card brand detected
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
    if (digits.length >= 6) {
      detectCardBrand(digits.slice(0, 6));
    } else {
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

      // Create card token
      const tokenResult = await mp.createCardToken({
        cardNumber: cleanCard,
        cardholderName: cardHolder,
        cardExpirationMonth: expMonth,
        cardExpirationYear: `20${expYear}`,
        securityCode: cvv,
        identificationType: 'CPF',
        identificationNumber: cleanCPF,
      });

      if (!tokenResult?.id) {
        throw new Error('Erro ao tokenizar cartão');
      }

      // Send to backend
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

      if (data?.status === 'approved') {
        onSuccess(data.orderId);
      } else if (data?.status === 'in_process') {
        toast.info('Pagamento em análise. Você será notificado quando for aprovado.');
        onSuccess(data.orderId);
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
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-5"
    >
      {/* Total compacto */}
      <div className="flex items-center justify-between bg-secondary/50 rounded-xl px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total a pagar</p>
          <p className="text-sm font-semibold truncate">{eventTitle}</p>
        </div>
        <span className="font-display font-bold text-2xl gradient-text flex-shrink-0">
          {formatPrice(totalAmount)}
        </span>
      </div>

      {/* Card Form */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="card-number">Número do cartão</Label>
          <div className="relative mt-1.5">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="card-number"
              value={cardNumber}
              onChange={(e) => handleCardNumberChange(e.target.value)}
              placeholder="0000 0000 0000 0000"
              maxLength={19}
              className="pl-10"
              inputMode="numeric"
            />
            {cardBrand && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-primary">
                {cardBrand}
              </span>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="card-holder">Nome do titular</Label>
          <Input
            id="card-holder"
            value={cardHolder}
            onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
            placeholder="NOME COMO NO CARTÃO"
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="expiry">Validade</Label>
            <Input
              id="expiry"
              value={expiryDate}
              onChange={(e) => setExpiryDate(formatExpiry(e.target.value))}
              placeholder="MM/AA"
              maxLength={5}
              className="mt-1.5"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label htmlFor="cvv">CVV</Label>
            <Input
              id="cvv"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="123"
              maxLength={4}
              className="mt-1.5"
              inputMode="numeric"
              type="password"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cpf-card">CPF do titular</Label>
          <Input
            id="cpf-card"
            value={cpf}
            onChange={(e) => setCpf(formatCPF(e.target.value))}
            placeholder="000.000.000-00"
            maxLength={14}
            className="mt-1.5"
            inputMode="numeric"
          />
        </div>

        {installmentOptions.length > 0 && (
          <div>
            <Label>Parcelas</Label>
            <Select value={installments} onValueChange={setInstallments}>
              <SelectTrigger className="mt-1.5">
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
        className="w-full"
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

      <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" />
        Pagamento seguro processado pelo Mercado Pago
      </p>
    </motion.div>
  );
}
