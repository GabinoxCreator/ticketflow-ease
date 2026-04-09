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
      if (!user?.id) return { totalRevenue: 0, totalTicketsSold: 0, totalOrders: 0, monthlySales: [] as MonthlySales[] };

      const { data: events } = await supabase
        .from('events')
        .select('id')
        .eq('producer_id', user.id);

      if (!events || events.length === 0) {
        return { totalRevenue: 0, totalTicketsSold: 0, totalOrders: 0, monthlySales: [] as MonthlySales[] };
      }

      const eventIds = events.map(e => e.id);

      const { data: orders } = await supabase
        .from('orders')
        .select('total_amount, status, created_at')
        .in('event_id', eventIds)
        .in('status', ['paid', 'completed']);

      const { data: tickets } = await supabase
        .from('tickets')
        .select('id, status')
        .in('event_id', eventIds)
        .neq('status', 'cancelled');

      const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalTicketsSold = tickets?.length || 0;
      const totalOrders = orders?.length || 0;

      // Aggregate monthly sales from orders
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthMap = new Map<string, { vendas: number; receita: number }>();

      // Initialize last 6 months
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        monthMap.set(key, { vendas: 0, receita: 0 });
      }

      orders?.forEach(o => {
        const d = new Date(o.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (monthMap.has(key)) {
          const entry = monthMap.get(key)!;
          entry.vendas += 1;
          entry.receita += Number(o.total_amount);
        }
      });

      const monthlySales: MonthlySales[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const entry = monthMap.get(key) || { vendas: 0, receita: 0 };
        monthlySales.push({ date: monthNames[d.getMonth()], ...entry });
      }

      return { totalRevenue, totalTicketsSold, totalOrders, monthlySales };
    },
    enabled: !!user?.id,
  });

  return {
    totalRevenue: data?.totalRevenue || 0,
    totalTicketsSold: data?.totalTicketsSold || 0,
    totalOrders: data?.totalOrders || 0,
    monthlySales: data?.monthlySales || [],
    isLoading,
  };
}
