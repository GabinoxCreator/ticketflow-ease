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
}

const DEFAULT: EventFees = {
  pixPercent: 10,
  pixFixed: 0,
  cardPercent: 10,
  cardFixed: 0,
};

// Hardening #6 (12/08/2026): a tabela event_fee_overrides era legível por
// qualquer um (USING true) — dava pra baixar a taxa negociada de TODOS os
// eventos + as notes da negociação. O checkout só precisa dos 4 números do
// evento em compra, e é o que a RPC pública devolve (sem notes, sem listar
// outros eventos). A tabela em si ficou restrita a admin.
export function useEventFees(eventId: string | undefined) {
  const { data, ...rest } = useQuery({
    queryKey: ['event-fees', eventId],
    queryFn: async (): Promise<EventFees> => {
      if (!eventId) return DEFAULT;
      // Leitura pública: client sem sessão, não espera o refresh de token.
      // cast: types.ts é auto-gerado e ainda não conhece a RPC nova
      const { data, error } = await (supabasePublic.rpc as any)('get_event_fees', {
        _event_id: eventId,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as {
        pix_percent: number | string;
        pix_fixed: number | string;
        card_percent: number | string;
        card_fixed: number | string;
      } | null;
      if (!row) return DEFAULT;
      return {
        pixPercent: Number(row.pix_percent),
        pixFixed: Number(row.pix_fixed),
        cardPercent: Number(row.card_percent),
        cardFixed: Number(row.card_fixed),
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
