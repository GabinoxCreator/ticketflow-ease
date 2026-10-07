import { supabase } from '@/integrations/supabase/client';
import { CartaoMarcelForm, CobrancaEmDuvidaError, type CotacaoMarcel, type DadosDoCartao } from './CartaoMarcelForm';
import { corpoDoErroDaEdge } from '@/lib/corpoDoErroDaEdge';

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

    // Os dois casos em que a cobrança PODE ter passado chegam como erro HTTP, e
    // resposta 4xx/5xx não preenche `data`: o corpo fica em `error.context`.
    //   409 `paid_pending_review`: o cartão passou e a mesa não pôde ser entregue
    //       (já marcado em vermelho no painel do produtor);
    //   502 `payment_provider_unreachable` COM pedido: não deu para saber se o
    //       banco aprovou. Sem pedido criado, não houve cobrança.
    // Antes (até a OS-165) os dois viravam um erro técnico na tela, com o Pagar
    // livre para tentar de novo. Agora o formulário trava o Pagar, mostra o aviso
    // fixo e leva ao acompanhamento desta mesma tela (`onInProcess`).
    const corpo = error ? await corpoDoErroDaEdge(error) : data;
    if (corpo?.orderId
        && (corpo?.status === 'paid_pending_review' || corpo?.error === 'payment_provider_unreachable')) {
      throw new CobrancaEmDuvidaError('Pagamento em verificação.', String(corpo.orderId));
    }
    if (error) throw error;

    if (data?.status === 'approved_pending_confirmation') {
      onApprovedPending(data.orderId, data.paymentId ? String(data.paymentId) : undefined, data.holdExpiresAt ?? null);
      return;
    }
    if (data?.status === 'rejected') {
      onRejected(data.errorCode || 'unknown');
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
      // O acompanhamento da mesa é a própria tela de checkout (passo
      // "Finalizando pagamento"), que segue conferindo o pedido. Sair dela
      // soltaria a reserva das mesas. Volta ao topo: o passo novo é curto e,
      // sem isso, a pessoa ficava olhando o rodapé da página.
      onEmDuvida={(orderId) => {
        onInProcess(orderId, undefined, null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    />
  );
}
