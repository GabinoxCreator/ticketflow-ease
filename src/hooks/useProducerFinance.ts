import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface EventFinance {
  id: string;
  title: string;
  date: string;
  image_url: string | null;
  gross: number;
  fee: number;
  net: number;
  paidOut: number;
  available: number;
  // Partition by sale_origin
  grossOnline: number;
  feeOnline: number;
  netOnline: number;
  grossManual: number;
  feeManual: number;
  netManual: number;
}

export interface PayoutRow {
  id: string;
  event_id: string | null;
  period_start: string;
  period_end: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  bank_account_snapshot: any;
  created_at: string;
}

export interface FeeConfig {
  percent: number;
  fixed: number;
}

interface FinanceData {
  feeConfig: FeeConfig;
  producerProfileId: string | null;
  events: EventFinance[];
  payouts: PayoutRow[];
  totals: {
    gross: number;
    fee: number;
    net: number;
    paidOut: number;
    available: number;
    grossOnline: number;
    netOnline: number;
    grossManual: number;
    netManual: number;
  };
}

interface Bucket {
  gross: number;
  fee: number;
}

export function useProducerFinance() {
  const { user } = useAuth();

  return useQuery<FinanceData>({
    queryKey: ['producer-finance', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // 1. Producer profile of current user
      const { data: membership } = await supabase
        .from('producer_members')
        .select('producer_profile_id')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .maybeSingle();

      const producerProfileId = membership?.producer_profile_id || null;

      // 2. Fee config (informational only — actual fee comes from each order)
      let feeConfig: FeeConfig = { percent: 10, fixed: 0 };
      if (producerProfileId) {
        const { data: override } = await supabase
          .from('producer_fee_overrides')
          .select('fee_percent, fee_fixed')
          .eq('producer_profile_id', producerProfileId)
          .maybeSingle();
        if (override) {
          feeConfig = {
            percent: Number(override.fee_percent),
            fixed: Number(override.fee_fixed),
          };
        }
      }

      // 3. Producer events
      const { data: events } = await supabase
        .from('events')
        .select('id, title, date, image_url')
        .eq('producer_id', user!.id)
        .order('date', { ascending: false });

      const eventList = events || [];
      const eventIds = eventList.map((e) => e.id);

      // 4. Paid orders per event, partitioned by sale_origin
      const onlineByEvent = new Map<string, Bucket>();
      const manualByEvent = new Map<string, Bucket>();
      if (eventIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select('event_id, total_amount, service_fee_amount, status, sale_origin')
          .in('event_id', eventIds)
          .in('status', ['paid', 'completed']);
        (orders || []).forEach((o: any) => {
          if (o.sale_origin === 'courtesy') return; // cortesias não entram em receita
          const isManual = o.sale_origin === 'manual';
          const map = isManual ? manualByEvent : onlineByEvent;
          const cur = map.get(o.event_id) || { gross: 0, fee: 0 };
          cur.gross += Number(o.total_amount || 0);
          cur.fee += Number(o.service_fee_amount || 0);
          map.set(o.event_id, cur);
        });
      }

      // 5. Payouts of this producer profile
      let payouts: PayoutRow[] = [];
      if (producerProfileId) {
        const { data } = await supabase
          .from('payouts')
          .select('*')
          .eq('producer_profile_id', producerProfileId)
          .order('created_at', { ascending: false });
        payouts = (data || []) as any as PayoutRow[];
      }

      const paidByEvent = new Map<string, number>();
      payouts
        .filter((p) => p.status === 'paid' && p.event_id)
        .forEach((p) => {
          paidByEvent.set(
            p.event_id!,
            (paidByEvent.get(p.event_id!) || 0) + Number(p.net_amount || 0)
          );
        });

      // 6. Build per-event finance using REAL stored fees (respects per-method overrides + apply_fee=false)
      const eventsFinance: EventFinance[] = eventList.map((e) => {
        const on = onlineByEvent.get(e.id) || { gross: 0, fee: 0 };
        const man = manualByEvent.get(e.id) || { gross: 0, fee: 0 };
        const gross = on.gross + man.gross;
        const fee = on.fee + man.fee;
        const net = Math.max(0, gross - fee);
        const paidOut = paidByEvent.get(e.id) || 0;
        return {
          id: e.id,
          title: e.title,
          date: e.date,
          image_url: e.image_url,
          gross,
          fee,
          net,
          paidOut,
          available: Math.max(0, net - paidOut),
          grossOnline: on.gross,
          feeOnline: on.fee,
          netOnline: Math.max(0, on.gross - on.fee),
          grossManual: man.gross,
          feeManual: man.fee,
          netManual: Math.max(0, man.gross - man.fee),
        };
      });

      const totals = eventsFinance.reduce(
        (acc, e) => {
          acc.gross += e.gross;
          acc.fee += e.fee;
          acc.net += e.net;
          acc.paidOut += e.paidOut;
          acc.available += e.available;
          acc.grossOnline += e.grossOnline;
          acc.netOnline += e.netOnline;
          acc.grossManual += e.grossManual;
          acc.netManual += e.netManual;
          return acc;
        },
        {
          gross: 0,
          fee: 0,
          net: 0,
          paidOut: 0,
          available: 0,
          grossOnline: 0,
          netOnline: 0,
          grossManual: 0,
          netManual: 0,
        }
      );

      return {
        feeConfig,
        producerProfileId,
        events: eventsFinance,
        payouts,
        totals,
      };
    },
  });
}
