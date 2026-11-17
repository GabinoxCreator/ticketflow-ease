import { useQuery } from '@tanstack/react-query';
import { useEventFees, computeFee } from '@/hooks/useEventFees';
import { supabase } from '@/integrations/supabase/client';
import { formatBRL } from '@/lib/painelDoProdutor';

interface Props {
  /** Preço do ingresso que o produtor digitou (valor de face). */
  preco: number;
  /**
   * Evento já criado: a taxa é a do evento, lida do mesmo lugar que a página de
   * compra lê (`get_event_fees`). Sem evento (assistente de criar), vale a taxa
   * padrão desse mesmo leitor, e a linha diz "taxa padrão".
   */
  eventId?: string;
  /**
   * 'absorve' = a taxa sai de dentro do preço (só a FestPag liga esse modo). Nesse
   * lote a linha não aparece: a taxa absorvida segue com a FestPag, fora do painel
   * (decisão do Gabriel, 09/11/2026).
   */
  modoTaxa?: string | null;
  className?: string;
}

// "Comprador paga R$ X no PIX ou R$ Y no cartão à vista · você recebe R$ Z", logo
// abaixo do preço (OS-408; os dois preços por decisão do Gabriel em 09/11/2026).
// O produtor digitava R$ 80 e só descobria na página de compra quanto o cliente
// paga. Só mostra: a conta de verdade continua sendo a do servidor na venda.
//
// O cartão tem, além da taxa da FestPag, o custo do cartão (2,99% na 1x em
// 09/11): o valor vem de `cartao_a_vista_cents`, que lê a mesma conta da cobrança
// no cartão (`opcoes_parcelamento`, 1 parcela). O parcelado, com juro, não aparece
// aqui. Sem a função no ar (ou se ela falhar), a linha mostra só o PIX.
export function TaxaAVista({ preco, eventId, modoTaxa, className }: Props) {
  const { fees, isLoading, isError } = useEventFees(eventId);
  const valor = Number(preco);
  const valido = Number.isFinite(valor) && valor > 0 && modoTaxa !== 'absorve';
  const taxaPix = valido ? computeFee(valor, fees.pixPercent, fees.pixFixed) : 0;
  const taxaCartao = valido ? computeFee(valor, fees.cardPercent, fees.cardFixed) : 0;
  const baseCartaoCentavos = Math.round((valor + taxaCartao) * 100);
  const cartao = useQuery({
    queryKey: ['cartao-a-vista', baseCartaoCentavos],
    enabled: valido && !(eventId && (isLoading || isError)),
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<number> => {
      const { data, error } = await (supabase.rpc as any)('cartao_a_vista_cents', { _base_cents: baseCartaoCentavos });
      if (error) throw error;
      if (data == null) throw new Error('sem o valor do cartão');
      return Number(data) / 100;
    },
  });

  if (!valido) return null;
  // Sem a taxa do evento em mãos, não mostra número (melhor nada que número errado).
  if (eventId && (isLoading || isError)) return null;

  const pagaPix = valor + taxaPix;
  // O produtor recebe o valor de face: a taxa e o custo do cartão são pagos por quem compra.
  const recebe = valor;

  return (
    <p className={className ?? 'text-xs text-muted-foreground'} data-testid="taxa-a-vista">
      Comprador paga <strong className="text-foreground">{formatBRL(pagaPix)}</strong> no PIX
      {cartao.data != null && (
        <>
          {' '}ou <strong className="text-foreground">{formatBRL(cartao.data)}</strong> no cartão à vista
        </>
      )}
      {' · '}você recebe <strong className="text-foreground">{formatBRL(recebe)}</strong>
      {!eventId && ' (taxa padrão)'}
    </p>
  );
}
