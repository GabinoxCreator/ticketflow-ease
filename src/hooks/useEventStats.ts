import { useMemo } from 'react';
import { useEventLots } from './useEventLots';
import { useEventOrders } from './useEventOrders';
import { useEventParticipants } from './useEventParticipants';

export function useEventStats(eventId: string | undefined) {
  const { lots, totalQuantity, soldQuantity, availableQuantity, isLoading: lotsLoading } = useEventLots(eventId);
  const { orders, totalRevenue, paidOrders, isLoading: ordersLoading } = useEventOrders(eventId);
  const { tickets, validTickets, usedTickets, cancelledTickets, isLoading: ticketsLoading } = useEventParticipants(eventId);

  const stats = useMemo(() => {
    // Count only paid tickets (valid or used)
    const paidTickets = tickets?.filter(t => t.status === 'valid' || t.status === 'used') || [];
    const paidTicketsCount = paidTickets.length;
    const actualAvailable = totalQuantity - paidTicketsCount;
    const conversionRate = totalQuantity > 0 ? ((paidTicketsCount / totalQuantity) * 100).toFixed(1) : '0';

    // Group sales by lot - only paid tickets
    const salesByLot = lots?.map(lot => {
      const lotTickets = paidTickets.filter(t => t.lot_id === lot.id);
      const lotRevenue = lotTickets.length * Number(lot.price);
      const progress = lot.total_quantity > 0 ? (lotTickets.length / lot.total_quantity) * 100 : 0;
      
      return {
        id: lot.id,
        name: lot.name,
        price: Number(lot.price),
        totalQuantity: lot.total_quantity,
        soldQuantity: lotTickets.length,
        availableQuantity: lot.total_quantity - lotTickets.length,
        revenue: lotRevenue,
        progress,
        isActive: lot.is_active,
      };
    }) || [];

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
        revenue: dayOrders.reduce((sum, order) => sum + Number(order.total_amount), 0),
        tickets: dayTickets.length,
      };
    });

    return {
      totalRevenue,
      totalTicketsSold: paidTicketsCount,
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
  }, [lots, tickets, orders, totalQuantity, soldQuantity, availableQuantity, totalRevenue, paidOrders, validTickets, usedTickets, cancelledTickets]);

  return {
    ...stats,
    isLoading: lotsLoading || ordersLoading || ticketsLoading,
  };
}
