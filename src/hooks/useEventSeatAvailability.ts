import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SeatAvailabilityBySector {
  seatTypeName: string;
  total: number;
  available: number;
  basePrice: number;
  extraPrice: number;
  baseCapacity: number;
  maxCapacity: number;
}

export function useEventSeatAvailability(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-seat-availability', eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<SeatAvailabilityBySector[]> => {
      const { data, error } = await supabase
        .from('event_seats')
        .select('status, seat_type_name, base_price, extra_price, base_capacity, max_capacity')
        .eq('event_id', eventId!);
      if (error) throw error;

      const map = new Map<string, SeatAvailabilityBySector>();
      for (const row of (data ?? []) as Array<{
        status: string;
        seat_type_name: string | null;
        base_price: number | null;
        extra_price: number | null;
        base_capacity: number | null;
        max_capacity: number | null;
      }>) {
        const name = row.seat_type_name || 'Mesa';
        const cur =
          map.get(name) ||
          ({
            seatTypeName: name,
            total: 0,
            available: 0,
            basePrice: Number(row.base_price ?? 0),
            extraPrice: Number(row.extra_price ?? 0),
            baseCapacity: Number(row.base_capacity ?? 0),
            maxCapacity: Number(row.max_capacity ?? 0),
          } as SeatAvailabilityBySector);
        cur.total += 1;
        if (row.status === 'available') cur.available += 1;
        const price = Number(row.base_price ?? 0);
        if (price > 0 && (cur.basePrice === 0 || price < cur.basePrice)) cur.basePrice = price;
        map.set(name, cur);
      }
      return Array.from(map.values()).sort((a, b) => a.seatTypeName.localeCompare(b.seatTypeName));
    },
    staleTime: 30_000,
  });
}
