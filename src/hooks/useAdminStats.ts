import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [producersRes, eventsRes, ordersRes, payoutsRes] = await Promise.all([
        supabase.from('producer_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('total_amount').eq('status', 'completed'),
        supabase.from('payouts').select('net_amount, status'),
      ]);

      const totalRevenue = (ordersRes.data || []).reduce((sum, o) => sum + Number(o.total_amount), 0);
      const pendingPayouts = (payoutsRes.data || [])
        .filter(p => p.status === 'pending')
        .reduce((sum, p) => sum + Number(p.net_amount), 0);

      return {
        totalProducers: producersRes.count || 0,
        totalEvents: eventsRes.count || 0,
        totalRevenue,
        pendingPayouts,
      };
    },
  });
}
