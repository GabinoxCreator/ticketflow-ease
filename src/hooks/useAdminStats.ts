import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TopEvent {
  eventId: string;
  title: string;
  gmv: number;
}

export interface PaymentMix {
  pix: number;
  card: number;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [producersRes, eventsCountRes, ordersRes, payoutsRes, ticketsRes, eventsListRes] =
        await Promise.all([
          supabase.from('producer_profiles').select('id', { count: 'exact', head: true }),
          supabase.from('events').select('id', { count: 'exact', head: true }),
          supabase
            .from('orders')
            .select('total_amount, service_fee_amount, payment_method, event_id')
            .eq('status', 'paid'),
          supabase.from('payouts').select('net_amount, status'),
          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .in('status', ['valid', 'used']),
          supabase.from('events').select('id, title'),
        ]);

      const orders = ordersRes.data || [];
      const gmv = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const platformRevenue = orders.reduce(
        (sum, o) => sum + Number(o.service_fee_amount || 0),
        0,
      );

      const pendingPayouts = (payoutsRes.data || [])
        .filter((p) => p.status === 'requested')
        .reduce((sum, p) => sum + Number(p.net_amount), 0);

      // Mix por igualdade exata: 'pix' ou 'card'. Outros (ex.: 'manual', 'pix:<id>') são ignorados.
      const mix: PaymentMix = { pix: 0, card: 0 };
      for (const o of orders) {
        const pm = o.payment_method;
        const v = Number(o.total_amount || 0);
        if (pm === 'pix') mix.pix += v;
        else if (pm === 'card') mix.card += v;
      }

      // Top 5 eventos por GMV
      const eventGmv = new Map<string, number>();
      for (const o of orders) {
        if (!o.event_id) continue;
        eventGmv.set(o.event_id, (eventGmv.get(o.event_id) || 0) + Number(o.total_amount || 0));
      }
      const eventsList = eventsListRes.data || [];
      const titleById = new Map<string, string>(eventsList.map((e) => [e.id, e.title]));
      const topEvents: TopEvent[] = Array.from(eventGmv.entries())
        .map(([eventId, gmvVal]) => ({
          eventId,
          title: titleById.get(eventId) || 'Evento removido',
          gmv: gmvVal,
        }))
        .sort((a, b) => b.gmv - a.gmv)
        .slice(0, 5);

      return {
        totalProducers: producersRes.count || 0,
        totalEvents: eventsCountRes.count || 0,
        gmv,
        platformRevenue,
        pendingPayouts,
        paidOrders: orders.length,
        ticketsSold: ticketsRes.count || 0,
        mix,
        topEvents,
      };
    },
  });
}
