import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TableStatus = 'available' | 'held' | 'sold' | 'blocked' | 'manual';

export interface EventTableRow {
  id: string;
  event_id: string;
  code: string | null;
  label: string | null;
  status: TableStatus;
  color: string | null;
  shape: string | null;
  seat_type_name: string | null;
  base_capacity: number | null;
  max_capacity: number | null;
  base_price: number | null;
  extra_price: number | null;
  sold_order_id: string | null;
  order_id: string | null;
  hold_expires_at: string | null;
  manually_closed_at: string | null;
  manual_close_reason: string | null;
  manual_holder_name: string | null;
  manual_holder_phone: string | null;
  manual_holder_notes: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  order_total: number | null;
  order_paid_at: string | null;
  seats_sold: number | null;
  // Posição no mapa, para a aba desenhar a planta em vez de listar cards.
  // Vem da mesma RPC; unidade desenhada antes desta mudança pode não ter.
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  radius: number | null;
  rotation: number | null;
}

/** "Disponível na prática": available, ou held com hold já expirado (gate do hold_seats). */
export function isEffectivelyAvailable(row: Pick<EventTableRow, 'status' | 'hold_expires_at'>): boolean {
  if (row.status === 'available') return true;
  if (row.status === 'held' && row.hold_expires_at && new Date(row.hold_expires_at).getTime() < Date.now()) {
    return true;
  }
  return false;
}

// LGPD (hardening #4, 12/08/2026): a leitura de gestão vem da RPC
// get_event_tables_management, SECURITY DEFINER escopada ao produtor dono do
// evento (ou admin) — manual_holder_*/order ids saíram do grant de SELECT do
// role authenticated, então não dá mais pra ler PII de terceiro direto na
// tabela. A RPC devolve seats + dados do comprador + ingressos emitidos numa
// chamada só, no MESMO formato que este hook sempre entregou.
/**
 * Como este evento chama o item do mapa: "mesa" (padrão) ou o que o produtor
 * definir — "camarote", no rodeio. Vem de `events.seat_noun`; nulo = "mesa",
 * que é o comportamento de todos os eventos existentes.
 */
export function useSeatNoun(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-seat-noun', eventId],
    enabled: !!eventId,
    // Muda uma vez na vida do evento: não faz sentido rebuscar a cada foco.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any)
        .from('events').select('seat_noun').eq('id', eventId!).maybeSingle();
      if (error) return null;
      return data?.seat_noun ?? null;
    },
  });
}

export function useEventTables(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-tables', eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<EventTableRow[]> => {
      // cast: types.ts é auto-gerado e ainda não conhece a RPC nova
      const { data, error } = await (supabase.rpc as any)('get_event_tables_management', {
        _event_id: eventId!,
      });
      if (error) throw error;
      return (data ?? []) as EventTableRow[];
    },
  });
}
