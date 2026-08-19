import { supabase } from '@/integrations/supabase/client';
import { CartaoMarcelForm, type CotacaoMarcel, type DadosDoCartao } from './CartaoMarcelForm';

/*
 * Passo do cartão no checkout de INGRESSO, pela rota do Marcel.
 *
 * A tela em si vive em `CartaoMarcelForm` — a mesma que o checkout de mesa usa.
 * Aqui fica só o que é específico do ingresso: o carrinho de lotes, o cupom e a
 * edge que cobra.
 */

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
  /** Aceite das condições do passe permanente. O servidor recusa a cobrança
   *  sem ele quando há passe no carrinho (§4b do framework do Rodeio). */
  passeAceito?: boolean;
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
  passeAceito,
  customerName,
  customerEmail,
  customerPhone,
  customerCPF,
  onSuccess,
  onError,
}: CheckoutStepCardMarcelProps) {
  const carrinho = items.map(i => ({ lotId: i.lotId, quantity: i.quantity }));

  // Cotação: pede à edge os valores já precificados. O servidor é a fonte da
  // verdade; a tela nunca calcula preço.
  const cotar = async (): Promise<CotacaoMarcel | null> => {
    const { data, error } = await supabase.functions.invoke('marcel-process-card', {
      body: { eventId, items: carrinho, couponId, quote: true },
    });
    if (error) throw error;
    return data as CotacaoMarcel;
  };

  const cobrar = async ({ installments, card }: { installments: number; card: DadosDoCartao }) => {
    const { data, error } = await supabase.functions.invoke('marcel-process-card', {
      body: {
        eventId,
        items: carrinho,
        customerName,
        customerEmail,
        customerPhone,
        customerCPF: customerCPF.replace(/\D/g, ''),
        couponId,
        passeAceito,
        installments,
        card,
      },
    });

    if (error) throw error;
    if (data?.status === 'approved') {
      onSuccess(data.orderId);
      return;
    }
    const msg = data?.error || 'Pagamento não aprovado. Tente outro cartão.';
    onError(msg);
    throw new Error(msg);
  };

  return (
    <CartaoMarcelForm
      totalAmount={totalAmount}
      nomeSugerido={customerName}
      rotuloFace="Ingressos"
      cotar={cotar}
      cobrar={cobrar}
    />
  );
}
