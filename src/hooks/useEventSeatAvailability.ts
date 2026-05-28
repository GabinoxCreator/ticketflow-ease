import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SeatAvailabilityBySector {
  seatTypeName: string;
  total: number;
  available: number;
  basePrice: number;
}

export function useEventSeatAvailability(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-seat-availability', eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<SeatAvailabilityBySector[]> => {
      const { data, error } = await supabase
        .from('event_seats')
        .select('status, seat_type_name, base_price')
        .eq('event_id', eventId!);
      if (error) throw error;

      const map = new Map<string, SeatAvailabilityBySector>();
      for (const row of (data ?? []) as Array<{
        status: string;
        seat_type_name: string | null;
        base_price: number | null;
      }>) {
        const name = row.seat_type_name || 'Mesa';
        const price = Number(row.base_price ?? 0);
        const cur =
          map.get(name) ||
          ({ seatTypeName: name, total: 0, available: 0, basePrice: price } as SeatAvailabilityBySector);
        cur.total += 1;
        if (row.status === 'available') cur.available += 1;
        if (price > 0 && (cur.basePrice === 0 || price < cur.basePrice)) cur.basePrice = price;
        map.set(name, cur);
      }
      return Array.from(map.values()).sort((a, b) => a.seatTypeName.localeCompare(b.seatTypeName));
    },
    staleTime: 30_000,
  });
}
