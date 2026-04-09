import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useProducerStats() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['producer-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return { totalRevenue: 0, totalTicketsSold: 0, totalOrders: 0 };

      // Get all events for this producer
      const { data: events } = await supabase
        .from('events')
        .select('id')
        .eq('producer_id', user.id);

      if (!events || events.length === 0) {
        return { totalRevenue: 0, totalTicketsSold: 0, totalOrders: 0 };
      }

      const eventIds = events.map(e => e.id);

      // Get paid orders
      const { data: orders } = await supabase
        .from('orders')
        .select('total_amount, status')
        .in('event_id', eventIds)
        .in('status', ['paid', 'completed']);

      // Get tickets sold
      const { data: tickets } = await supabase
        .from('tickets')
        .select('id, status')
        .in('event_id', eventIds)
        .neq('status', 'cancelled');

      const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalTicketsSold = tickets?.length || 0;
      const totalOrders = orders?.length || 0;

      return { totalRevenue, totalTicketsSold, totalOrders };
    },
    enabled: !!user?.id,
  });

  return {
    totalRevenue: data?.totalRevenue || 0,
    totalTicketsSold: data?.totalTicketsSold || 0,
    totalOrders: data?.totalOrders || 0,
    isLoading,
  };
}
