import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface MonthlySales {
  date: string;
  vendas: number;
  receita: number;
}

export function useProducerStats() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['producer-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        return {
          totalRevenue: 0,
          totalTicketsSold: 0,
          totalOrders: 0,
          totalCapacity: 0,
          conversionRate: null as number | null,
          averageTicket: 0,
          revenueTrend: 0,
          ticketsTrend: 0,
          nextEventDate: null as string | null,
          monthlySales: [] as MonthlySales[],
        };
      }

      const { data: events } = await supabase
        .from('events')
        .select('id, date, status')
        .eq('producer_id', user.id);

      if (!events || events.length === 0) {
        return {
          totalRevenue: 0,
          totalTicketsSold: 0,
          totalOrders: 0,
          totalCapacity: 0,
          conversionRate: null,
          averageTicket: 0,
          revenueTrend: 0,
          ticketsTrend: 0,
          nextEventDate: null,
          monthlySales: [] as MonthlySales[],
        };
      }

      const eventIds = events.map(e => e.id);

      const [ordersRes, ticketsRes, lotsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('total_amount, status, created_at')
          .in('event_id', eventIds)
          .in('status', ['paid', 'completed']),
        supabase
          .from('tickets')
          .select('id, status, created_at')
          .in('event_id', eventIds)
          .in('status', ['valid', 'used']),
        supabase
          .from('event_lots')
          .select('total_quantity')
          .in('event_id', eventIds),
      ]);

      const orders = ordersRes.data || [];
      const tickets = ticketsRes.data || [];
      const lots = lotsRes.data || [];

      const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
      const totalTicketsSold = tickets.length;
      const totalOrders = orders.length;
      const totalCapacity = lots.reduce((sum, l) => sum + Number(l.total_quantity || 0), 0);

      const conversionRate = totalCapacity > 0
        ? Number(((totalTicketsSold / totalCapacity) * 100).toFixed(1))
        : null;

      const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Aggregate monthly sales (last 6 months)
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthMap = new Map<string, { vendas: number; receita: number }>();

      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        monthMap.set(key, { vendas: 0, receita: 0 });
      }

      orders.forEach(o => {
        const d = new Date(o.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (monthMap.has(key)) {
          const entry = monthMap.get(key)!;
          entry.vendas += 1;
          entry.receita += Number(o.total_amount);
        }
      });

      // Tickets per month for ticketsTrend
      const ticketsByMonth = new Map<string, number>();
      tickets.forEach(t => {
        const d = new Date(t.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        ticketsByMonth.set(key, (ticketsByMonth.get(key) || 0) + 1);
      });

      const monthlySales: MonthlySales[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const entry = monthMap.get(key) || { vendas: 0, receita: 0 };
        monthlySales.push({ date: monthNames[d.getMonth()], ...entry });
      }

      // Trends: current month vs previous month
      const currentKey = `${now.getFullYear()}-${now.getMonth()}`;
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevKey = `${prevDate.getFullYear()}-${prevDate.getMonth()}`;

      const currentRev = monthMap.get(currentKey)?.receita || 0;
      const prevRev = monthMap.get(prevKey)?.receita || 0;
      const revenueTrend = prevRev > 0
        ? Number((((currentRev - prevRev) / prevRev) * 100).toFixed(1))
        : (currentRev > 0 ? 100 : 0);

      const currentTickets = ticketsByMonth.get(currentKey) || 0;
      const prevTickets = ticketsByMonth.get(prevKey) || 0;
      const ticketsTrend = prevTickets > 0
        ? Number((((currentTickets - prevTickets) / prevTickets) * 100).toFixed(1))
        : (currentTickets > 0 ? 100 : 0);

      // Next published event
      const todayStr = new Date().toISOString().split('T')[0];
      const upcoming = events
        .filter(e => e.status === 'published' && e.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date));
      const nextEventDate = upcoming[0]?.date || null;

      return {
        totalRevenue,
        totalTicketsSold,
        totalOrders,
        totalCapacity,
        conversionRate,
        averageTicket,
        revenueTrend,
        ticketsTrend,
        nextEventDate,
        monthlySales,
      };
    },
    enabled: !!user?.id,
  });

  return {
    totalRevenue: data?.totalRevenue || 0,
    totalTicketsSold: data?.totalTicketsSold || 0,
    totalOrders: data?.totalOrders || 0,
    totalCapacity: data?.totalCapacity || 0,
    conversionRate: data?.conversionRate ?? null,
    averageTicket: data?.averageTicket || 0,
    revenueTrend: data?.revenueTrend || 0,
    ticketsTrend: data?.ticketsTrend || 0,
    nextEventDate: data?.nextEventDate || null,
    monthlySales: data?.monthlySales || [],
    isLoading,
  };
}
