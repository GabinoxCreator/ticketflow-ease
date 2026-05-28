import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ProducerMapOption {
  id: string;
  name: string;
  venue_id: string;
  venue_name: string;
  seats_count: number;
}

/**
 * Lists all active table_maps owned by the current producer,
 * across all their venues. Used in event forms to pick which map
 * to attach to the event.
 */
export function useProducerTableMaps() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['producer-table-maps', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ProducerMapOption[]> => {
      const { data: venues, error: venuesError } = await supabase
        .from('venues')
        .select('id, name')
        .eq('producer_id', user!.id);
      if (venuesError) throw venuesError;
      if (!venues || venues.length === 0) return [];

      const venueIds = venues.map((v) => v.id);
      const venueNameById = new Map(venues.map((v) => [v.id, v.name]));

      const { data: maps, error: mapsError } = await supabase
        .from('table_maps')
        .select('id, name, venue_id')
        .in('venue_id', venueIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (mapsError) throw mapsError;
      if (!maps || maps.length === 0) return [];

      const mapIds = maps.map((m) => m.id);
      const { data: seats } = await supabase
        .from('venue_seats')
        .select('table_map_id')
        .in('table_map_id', mapIds)
        .eq('is_active', true);

      const counts = new Map<string, number>();
      (seats ?? []).forEach((s) => {
        if (!s.table_map_id) return;
        counts.set(s.table_map_id, (counts.get(s.table_map_id) ?? 0) + 1);
      });

      return maps.map((m) => ({
        id: m.id,
        name: m.name,
        venue_id: m.venue_id,
        venue_name: venueNameById.get(m.venue_id) ?? '',
        seats_count: counts.get(m.id) ?? 0,
      }));
    },
  });
}
