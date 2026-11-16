import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEventLots } from './useEventLots';
import { useEventTotals } from './useEventOrders';
import { computeProducerFinance, computeSalesByLot, orderTicketNet, saleOrigin } from '@/lib/producerFinance';
import { lerVendasParaContas } from '@/lib/painelDoEvento';
import { useLotSales, lotSalesOf, sumLotSales } from './useLotSales';

/**
 * Números do topo e da visão geral do evento.
 *
 * Desde a OS-408 (etapa 4) os totais vêm do banco (`painel_evento_totais`), e não do
 * tamanho de uma lista que a API cortava no teto de linhas. As contas por lote e por dia
 * continuam as de sempre (src/lib/producerFinance.ts), agora sobre os pedidos pagos e os
 * ingressos lidos em blocos, inteiros.
 */
export function useEventStats(eventId: string | undefined) {
  const { lots, totalQuantity, isLoading: lotsLoading } = useEventLots(eventId);
  const { data: totais, isLoading: totaisLoading } = useEventTotals(eventId);
  const { data: vendas, isLoading: vendasLoading } = useQuery({
    queryKey: ['event-orders', eventId, 'vendas-para-contas'],
    queryFn: () => lerVendasParaContas(eventId as string),
    enabled: !!eventId,
  });
  const { data: vendasPorLote } = useLotSales(eventId ? [eventId] : []);

  const stats = useMemo(() => {
    const pagos = vendas?.pagos ?? [];
    const tickets = vendas?.ingressos ?? [];

    // Ingressos pagos (válidos ou usados), cortesia inclusa: é o que ocupa a capacidade.
    const paidTicketsCount = totais
      ? totais.ingressos_validos + totais.ingressos_usados
      : tickets.filter((t) => t.status === 'valid' || t.status === 'used').length;
    const actualAvailable = totalQuantity - paidTicketsCount;
    const conversionRate = totalQuantity > 0 ? ((paidTicketsCount / totalQuantity) * 100).toFixed(1) : '0';

    // "Vendido" do banco; se a leitura dos totais falhar, a mesma conta feita aqui.
    const totalRevenue = totais ? totais.vendido : computeProducerFinance(pagos).total;

    // "Vendidos" = pago, sem cortesia; cortesia à parte (decisão do Gabriel, 02/10/2026).
    // Sem a contagem (carregando ou falhou) o número é null e a tela mostra "—".
    const semContagem = vendasPorLote === undefined;
    const vendasDoEvento = sumLotSales(vendasPorLote);

    // Quebra por lote — fonte única (src/lib/producerFinance.ts): rateio do valor
    // do ingresso (sem taxa, sem cortesia) entre os tickets pagos. A quantidade
    // vendida vem da contagem do banco, com a cortesia separada.
    const salesByLot = computeSalesByLot({ orders: pagos, tickets, lots }).map((row) => {
      const doLote = lotSalesOf(vendasPorLote, row.id);
      return {
        ...row,
        soldQuantity: semContagem ? null : doLote.vendidos as number | null,
        courtesyQuantity: semContagem ? 0 : doLote.cortesias,
      };
    });

    // Sales over time (last 7 days)
    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });

    const salesByDay = last7Days.map(day => {
      const dayOrders = pagos.filter(order => order.created_at.startsWith(day));
      const dayTickets = tickets.filter(ticket => ticket.created_at.startsWith(day));

      return {
        date: day,
        label: new Date(day).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
        // Receita do dia coerente com o resumo: ingresso sem taxa, sem cortesia
        revenue: dayOrders.reduce((sum, order) => sum + (saleOrigin(order) === 'courtesy' ? 0 : orderTicketNet(order)), 0),
        tickets: dayTickets.length,
      };
    });

    return {
      totalRevenue,
      // null = sem a contagem: a tela mostra "—" em vez de um número errado.
      totalTicketsSold: semContagem ? null : vendasDoEvento.vendidos,
      totalCourtesies: semContagem ? 0 : vendasDoEvento.cortesias,
      totalTicketsAvailable: actualAvailable,
      totalCapacity: totalQuantity,
      conversionRate: parseFloat(conversionRate),
      validTickets: totais?.ingressos_validos ?? 0,
      usedTickets: totais?.ingressos_usados ?? 0,
      cancelledTickets: totais?.ingressos_cancelados ?? 0,
      totalOrders: totais?.pedidos ?? 0,
      paidOrders: totais?.pagos ?? 0,
      salesByLot,
      salesByDay,
    };
  }, [lots, totalQuantity, totais, vendas, vendasPorLote]);

  return {
    ...stats,
    isLoading: lotsLoading || totaisLoading || vendasLoading,
  };
}
