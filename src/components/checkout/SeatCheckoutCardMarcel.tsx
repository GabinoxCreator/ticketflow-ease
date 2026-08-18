import { supabase } from '@/integrations/supabase/client';
import { CartaoMarcelForm, type CotacaoMarcel, type DadosDoCartao } from './CartaoMarcelForm';

/*
 * Cartão do checkout de MESA/CAMAROTE, pela rota do Marcel.
 *
 * Tem DE PROPÓSITO a mesma assinatura do `SeatCheckoutCard` (a versão do
 * Mercado Pago): assim a tela de checkout troca um pelo outro conforme o
 * provedor do evento, sem nenhuma outra diferença. Se as assinaturas
 * divergirem, a troca vira um `if` cheio de adaptação — e é aí que nasce a
 * versão que ninguém mantém.
 *
 * Diferença real entre os dois: o Mercado Pago tokeniza o cartão no navegador
 * (SDK deles) e manda um token; a rota do Marcel recebe os dados do cartão na
 * edge, que fala com a adquirente. Por isso este componente não carrega SDK
 * nenhum.
 */

interface SeatPayload {
  seatId: string;
  addons: number;
}

interface Props {
  eventId: string;
  eventTitle: string;
  holdToken: string;
  seats: SeatPayload[];
  totalAmount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCPF: string;
  onApprovedPending: (orderId: string, paymentId: string | undefined, holdExpiresAt: string | null) => void;
  onInProcess: (orderId: string, paymentId: string | undefined, holdExpiresAt: string | null) => void;
  onRejected: (errorCode: string) => void;
  onError: (message: string) => void;
}

export function SeatCheckoutCardMarcel({
  eventId, holdToken, seats, totalAmount,
  customerName, customerEmail, customerPhone, customerCPF,
  onApprovedPending, onInProcess, onRejected, onError,
}: Props) {
  const cotar = async (): Promise<CotacaoMarcel | null> => {
    const { data, error } = await supabase.functions.invoke('marcel-charge-seat-card', {
      body: { eventId, holdToken, seats, quote: true },
    });
    if (error) throw error;
    return data as CotacaoMarcel;
  };

  const cobrar = async ({ installments, card }: { installments: number; card: DadosDoCartao }) => {
    const { data, error } = await supabase.functions.invoke('marcel-charge-seat-card', {
      body: {
        eventId,
        holdToken,
        seats,
        customerName,
        customerEmail,
        customerPhone,
        customerCPF: customerCPF.replace(/\D/g, ''),
        installments,
        card,
      },
    });

    if (error) throw error;

    if (data?.status === 'approved_pending_confirmation') {
      onApprovedPending(data.orderId, data.paymentId ? String(data.paymentId) : undefined, data.holdExpiresAt ?? null);
      return;
    }
    if (data?.status === 'rejected') {
      onRejected(data.errorCode || 'unknown');
      return;
    }
    // `paid_pending_review`: o cartão passou mas a mesa não pôde ser entregue.
    // NÃO dizer "recusado" — o cliente foi cobrado. O caso já está marcado em
    // vermelho no painel do produtor para alguém resolver.
    if (data?.status === 'paid_pending_review') {
      onInProcess(data.orderId, undefined, null);
      return;
    }
    // Reserva vencida ou mesa tomada no meio do caminho: a tela sabe traduzir
    // esses códigos e devolver o cliente ao mapa.
    if (data?.error) {
      const msg = data.error === 'payment_provider_unreachable'
        ? 'Pagamento em verificação. Não tente de novo — vamos confirmar em instantes.'
        : (data.message || 'Não foi possível processar. Tente novamente.');
      onError(msg);
      throw new Error(msg);
    }

    const generico = 'Não foi possível processar. Tente novamente.';
    onError(generico);
    throw new Error(generico);
  };

  return (
    <CartaoMarcelForm
      totalAmount={totalAmount}
      nomeSugerido={customerName}
      rotuloFace={seats.length > 1 ? 'Mesas' : 'Mesa'}
      cotar={cotar}
      cobrar={cobrar}
    />
  );
}
