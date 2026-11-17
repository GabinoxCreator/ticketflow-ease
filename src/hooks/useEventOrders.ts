import { useInfiniteQuery, useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { analyzeAttempts } from '@/lib/orderAttempts';
import {
  POR_PAGINA,
  semRepetido,
  lerPaginaDePedidos,
  lerTodosOsPedidos,
  lerTotaisDoEvento,
  lerVendidoPorCupom,
  chaveDosFiltros,
  type FiltroPedidos,
  type FiltrosDoPedido,
} from '@/lib/painelDoEvento';

export interface OrderReviewReason {
  expected?: number;
  delivered?: number;
  mp_payment_id?: string;
  transaction_amount?: number;
  order_status?: string;
  detected_at?: string;
  flavor?: 'a_partial' | 'b_terminal';
}

export interface Order {
  id: string;
  event_id: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_cpf?: string | null;
  total_amount: number;
  service_fee_amount?: number;
  /** Valor de face para o produtor (sem taxa, sem juro), calculado pelo banco. */
  producer_value?: number | null;
  status: 'pending' | 'paid' | 'completed' | 'cancelled' | 'refunded' | 'failed' | 'expired' | 'charged_back';
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  sale_origin?: 'online' | 'manual' | 'courtesy';
  manual_payment_method?: string | null;
  manual_payment_note?: string | null;
  manual_sold_by?: string | null;
  manual_fee_applied?: boolean;
  // Cupom aplicado no checkout (desconto já abatido de total_amount)
  coupon_id?: string | null;
  discount_amount?: number | null;
  event_coupons?: { code: string } | null;
  // Fase 10: revisão manual (entrega parcial / pago sem entrega)
  review_status?: 'partial_delivery' | 'paid_no_delivery' | null;
  review_reason?: OrderReviewReason | null;
  review_flagged_at?: string | null;
}

/**
 * Pedidos do evento em PÁGINAS de 50 (OS-408, etapa 4): a situação (aba) e a busca são
 * filtradas no banco; "carregar mais" pede a próxima página. Antes vinha a lista inteira
 * de uma vez, e acima do teto de linhas da API a lista e os totais saíam cortados.
 *
 * A chave começa com ['event-orders', evento]: quem já invalida essa chave (venda
 * manual, cancelamento, cortesia) atualiza as páginas, os totais e as tentativas juntos.
 */
export function useEventOrders(eventId: string | undefined, filtro: FiltroPedidos = { situacao: 'todos' }) {
  const termo = (filtro.busca || '').trim();
  // Período, ingresso, forma de pagamento e cupom (etapa 5) também filtram no banco.
  const consulta = useInfiniteQuery({
    queryKey: ['event-orders', eventId, 'pagina', filtro.situacao, termo, chaveDosFiltros(filtro)],
    queryFn: ({ pageParam }) =>
      lerPaginaDePedidos(eventId as string, { ...filtro, busca: termo }, pageParam, pageParam + POR_PAGINA - 1),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const lidas = todas.reduce((s, p) => s + p.linhas.length, 0);
      return ultima.linhas.length > 0 && lidas < ultima.total ? lidas : undefined;
    },
    enabled: !!eventId,
  });

  // SAFETY (Parte 2.1): manual mutation of orders.status from the client is
  // disabled. Transitions to paid/refunded/cancelled/failed/expired affect
  // tickets and inventory and MUST go through server-side flows
  // (mercadopago-webhook, expire-pending-orders, reconcile-orphan-orders).
  // Re-enabling requires a dedicated server-side endpoint with audit.
  const updateOrderStatus = useMutation({
    mutationFn: async (_args: { orderId: string; status: Order['status'] }) => {
      throw new Error(
        'Alteração manual do status do pedido está desabilitada. ' +
        'Use os fluxos automáticos (webhook, expiração, reconciliação).'
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const paginas = consulta.data?.pages ?? [];
  const orders = semRepetido(paginas.flatMap((p) => p.linhas));
  return {
    orders,
    /** Quantos pedidos o filtro tem no banco (não o tamanho da página). */
    total: paginas.length ? paginas[paginas.length - 1].total : 0,
    temMais: !!consulta.hasNextPage,
    carregarMais: () => consulta.fetchNextPage(),
    carregandoMais: consulta.isFetchingNextPage,
    isLoading: consulta.isLoading,
    error: consulta.error,
    updateOrderStatus,
  };
}

/** Os números dos cartões do evento (pedidos e ingressos), vindos do banco. */
export function useEventTotals(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-orders', eventId, 'totais'],
    queryFn: () => lerTotaisDoEvento(eventId as string),
    enabled: !!eventId,
  });
}

/**
 * Aba "Não concluídos": quem comprou depois e quem não voltou precisa comparar TODAS as
 * tentativas com TODOS os pagos, então aqui se lê tudo (em blocos de 500), só quando a
 * aba é aberta.
 */
export function useTentativasDoEvento(eventId: string | undefined, ligado: boolean, filtros: FiltrosDoPedido = {}) {
  return useQuery({
    queryKey: ['event-orders', eventId, 'tentativas', chaveDosFiltros(filtros)],
    queryFn: async () => {
      // Os filtros da etapa 5 valem para as tentativas mostradas; "comprou depois"
      // continua comparando com TODOS os pagos do evento.
      const [tentativas, pagos] = await Promise.all([
        lerTodosOsPedidos(eventId as string, { ...filtros, situacao: 'nao_concluidos' }),
        lerTodosOsPedidos(eventId as string, { situacao: 'pagos' }),
      ]);
      return { tentativas, ...analyzeAttempts(tentativas, pagos) };
    },
    enabled: !!eventId && ligado,
  });
}

/**
 * Quanto cada cupom vendeu (etapa 5, item 5.6). Mora sob ['event-orders', evento]: uma
 * venda, cortesia ou cancelamento que atualiza os pedidos atualiza isto junto.
 */
export function useVendidoPorCupom(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-orders', eventId, 'por-cupom'],
    queryFn: () => lerVendidoPorCupom(eventId as string),
    enabled: !!eventId,
  });
}
