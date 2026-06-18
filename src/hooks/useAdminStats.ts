import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [producersRes, eventsRes, ordersRes, payoutsRes] = await Promise.all([
        supabase.from('producer_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('total_amount, service_fee_amount').eq('status', 'paid'),
        supabase.from('payouts').select('net_amount, status'),
      ]);

      const orders = ordersRes.data || [];
      const gmv = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const platformRevenue = orders.reduce((sum, o) => sum + Number(o.service_fee_amount || 0), 0);

      const pendingPayouts = (payoutsRes.data || [])
        .filter(p => p.status === 'requested')
        .reduce((sum, p) => sum + Number(p.net_amount), 0);

      return {
        totalProducers: producersRes.count || 0,
        totalEvents: eventsRes.count || 0,
        gmv,
        platformRevenue,
        pendingPayouts,
      };
    },
  });
}
