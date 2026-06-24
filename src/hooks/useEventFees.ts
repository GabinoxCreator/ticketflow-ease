import { useQuery } from '@tanstack/react-query';
import { supabasePublic } from '@/integrations/supabase/publicClient';

export interface EventFeeOverride {
  id: string;
  event_id: string;
  payment_method: 'pix' | 'card';
  fee_percent: number;
  fee_fixed: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventFees {
  pixPercent: number;
  pixFixed: number;
  cardPercent: number;
  cardFixed: number;
  overrides: EventFeeOverride[];
}

const DEFAULT: EventFees = {
  pixPercent: 10,
  pixFixed: 0,
  cardPercent: 10,
  cardFixed: 0,
  overrides: [],
};

export function useEventFees(eventId: string | undefined) {
  const { data, ...rest } = useQuery({
    queryKey: ['event-fees', eventId],
    queryFn: async (): Promise<EventFees> => {
      if (!eventId) return DEFAULT;
      // Leitura pública: client sem sessão, não espera o refresh de token.
      const { data, error } = await supabasePublic
        .from('event_fee_overrides' as any)
        .select('*')
        .eq('event_id', eventId);
      if (error) throw error;
      const list = (data || []) as unknown as EventFeeOverride[];
      const pix = list.find((o) => o.payment_method === 'pix');
      const card = list.find((o) => o.payment_method === 'card');
      return {
        pixPercent: pix ? Number(pix.fee_percent) : 10,
        pixFixed: pix ? Number(pix.fee_fixed) : 0,
        cardPercent: card ? Number(card.fee_percent) : 10,
        cardFixed: card ? Number(card.fee_fixed) : 0,
        overrides: list,
      };
    },
    enabled: !!eventId,
    staleTime: 60_000,
  });

  return { fees: data ?? DEFAULT, ...rest };
}

export function computeFee(subtotal: number, percent: number, fixed: number) {
  const fee = (subtotal * percent) / 100 + fixed;
  return Math.max(0, Math.round(fee * 100) / 100);
}
