import { useMemo } from 'react';
import { useEventLots } from './useEventLots';
import { useEventOrders } from './useEventOrders';
import { useEventParticipants } from './useEventParticipants';
import { computeSalesByLot, orderTicketNet, saleOrigin } from '@/lib/producerFinance';
import { useLotSales, lotSalesOf, sumLotSales } from './useLotSales';

export function useEventStats(eventId: string | undefined) {
  const { lots, totalQuantity, soldQuantity, availableQuantity, isLoading: lotsLoading } = useEventLots(eventId);
  const { orders, totalRevenue, paidOrders, isLoading: ordersLoading } = useEventOrders(eventId);
  const { tickets, validTickets, usedTickets, cancelledTickets, isLoading: ticketsLoading } = useEventParticipants(eventId);
  const { data: vendasPorLote } = useLotSales(eventId ? [eventId] : []);

  const stats = useMemo(() => {
    // Count only paid tickets (valid or used)
    const paidTickets = tickets?.filter(t => t.status === 'valid' || t.status === 'used') || [];
    const paidTicketsCount = paidTickets.length;
    const actualAvailable = totalQuantity - paidTicketsCount;
    const conversionRate = totalQuantity > 0 ? ((paidTicketsCount / totalQuantity) * 100).toFixed(1) : '0';

    // "Vendidos" = pago, sem cortesia; cortesia à parte (decisão do Gabriel, 02/10/2026).
    // Sem a contagem (carregando ou falhou) o número é null e a tela mostra "—".
    const semContagem = vendasPorLote === undefined;
    const vendas = sumLotSales(vendasPorLote);

    // Quebra por lote — fonte única (src/lib/producerFinance.ts): rateio do valor
    // do ingresso (sem taxa, sem cortesia) entre os tickets pagos. A quantidade
    // vendida vem da contagem do banco, com a cortesia separada.
    const salesByLot = computeSalesByLot({ orders: paidOrders, tickets, lots }).map((row) => {
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
      const dayOrders = paidOrders?.filter(order => 
        order.created_at.startsWith(day)
      ) || [];
      const dayTickets = tickets?.filter(ticket =>
        ticket.created_at.startsWith(day)
      ) || [];
      
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
      totalTicketsSold: semContagem ? null : vendas.vendidos,
      totalCourtesies: semContagem ? 0 : vendas.cortesias,
      totalTicketsAvailable: actualAvailable,
      totalCapacity: totalQuantity,
      conversionRate: parseFloat(conversionRate),
      validTickets: validTickets?.length || 0,
      usedTickets: usedTickets?.length || 0,
      cancelledTickets: cancelledTickets?.length || 0,
      totalOrders: orders?.length || 0,
      paidOrders: paidOrders?.length || 0,
      salesByLot,
      salesByDay,
    };
  }, [lots, tickets, orders, totalQuantity, soldQuantity, availableQuantity, totalRevenue, paidOrders, validTickets, usedTickets, cancelledTickets, vendasPorLote]);

  return {
    ...stats,
    isLoading: lotsLoading || ordersLoading || ticketsLoading,
  };
}
