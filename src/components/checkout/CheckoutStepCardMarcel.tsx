import { supabase } from '@/integrations/supabase/client';
import { CartaoMarcelForm, CartaoRecusadoError, CobrancaEmDuvidaError, type CotacaoMarcel, type DadosDoCartao } from './CartaoMarcelForm';
import { corpoDoErroDaEdge } from '@/lib/corpoDoErroDaEdge';

/*
 * Passo do cartão no checkout de INGRESSO, pela rota do Marcel.
 *
 * A tela em si vive em `CartaoMarcelForm` — a mesma que o checkout de mesa usa.
 * Aqui fica só o que é específico do ingresso: o carrinho de lotes, o cupom e a
 * edge que cobra.
 */

import { corpoDoCarrinho, temLoja, type ItemDoCarrinho } from '@/lib/loja/carrinho';

// Ingresso, produto ou combo: ver src/lib/loja/carrinho.ts.
type CartItem = ItemDoCarrinho;

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
  /** Gera o PIX do mesmo carrinho depois que o banco recusa o cartão. */
  onPagarComPix?: () => Promise<void>;
  /** Cobrança em dúvida: leva ao acompanhamento do pedido (`/pedido/:id`). */
  onEmDuvida?: (orderId: string) => void;
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
  onPagarComPix,
  onEmDuvida,
}: CheckoutStepCardMarcelProps) {
  // `items` (lotes) no formato de sempre; `products` e `bundles` só quando há loja.
  const carrinho = corpoDoCarrinho(items);

  // Cotação: pede à edge os valores já precificados. O servidor é a fonte da
  // verdade; a tela nunca calcula preço.
  const cotar = async (): Promise<CotacaoMarcel | null> => {
    const { data, error } = await supabase.functions.invoke('marcel-process-card', {
      body: { eventId, ...carrinho, couponId, quote: true },
    });
    if (error) throw error;
    return data as CotacaoMarcel;
  };

  const cobrar = async ({ installments, card }: { installments: number; card: DadosDoCartao }) => {
    const { data, error } = await supabase.functions.invoke('marcel-process-card', {
      body: {
        eventId,
        ...carrinho,
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

    if (error) {
      // 409 `pedido_inconsistente`: o cartão PASSOU e o pedido não pôde ser
      // entregue. Tentar de novo cobraria duas vezes.
      const corpo = await corpoDoErroDaEdge(error);
      if (corpo?.aprovado === true && corpo?.orderId) {
        throw new CobrancaEmDuvidaError('Pagamento em verificação.', String(corpo.orderId));
      }
      throw error;
    }
    if (data?.status === 'approved') {
      onSuccess(data.orderId);
      return;
    }
    // Resultado indefinido (202 `indefinido:true`): a cobrança PODE ter passado.
    // O formulário trava o Pagar e leva ao acompanhamento (OS-165).
    if (data?.indefinido && data?.orderId) {
      throw new CobrancaEmDuvidaError(
        data?.message || 'Não conseguimos confirmar o pagamento.', String(data.orderId));
    }
    // Recusa EXPLÍCITA do banco (`aprovado:false` + `status:'rejected'`): é o único
    // caso em que a tela oferece PIX. Resultado indefinido (202 `indefinido:true`)
    // nunca chega aqui (ramo de cima), de propósito: a cobrança pode ter passado.
    if (data?.aprovado === false && data?.status === 'rejected' && !data?.indefinido) {
      const recusa = data?.message || data?.error || 'Pagamento recusado. Tente outro cartão.';
      onError(recusa);
      throw new CartaoRecusadoError(recusa);
    }
    // Qualquer outra resposta: `message` vem em texto de gente; `error` pode ser
    // só um código.
    const msg = data?.message || data?.error || 'Pagamento não aprovado. Tente outro cartão.';
    onError(msg);
    throw new Error(msg);
  };

  return (
    <CartaoMarcelForm
      totalAmount={totalAmount}
      nomeSugerido={customerName}
      // Carrinho com produto ou combo da loja não é só ingresso.
      rotuloFace={temLoja(items) ? 'Itens' : 'Ingressos'}
      cotar={cotar}
      cobrar={cobrar}
      onPagarComPix={onPagarComPix}
      onEmDuvida={onEmDuvida}
    />
  );
}
