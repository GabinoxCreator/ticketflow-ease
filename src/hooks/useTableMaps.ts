import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TableMap {
  id: string;
  venue_id: string;
  name: string;
  canvas_width: number;
  canvas_height: number;
  background_color: string | null;
  background_image_url: string | null;
  orientation: 'landscape' | 'portrait';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  seats_count?: number;
}

export interface TableMapFormData {
  name: string;
  background_color?: string | null;
}

export function useTableMaps(venueId: string | undefined) {
  return useQuery({
    queryKey: ['table_maps', venueId],
    enabled: !!venueId,
    queryFn: async (): Promise<TableMap[]> => {
      const { data: maps, error } = await supabase
        .from('table_maps')
        .select('*')
        .eq('venue_id', venueId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!maps || maps.length === 0) return [];

      const ids = maps.map((m) => m.id);
      const { data: seats } = await supabase
        .from('venue_seats')
        .select('table_map_id')
        .in('table_map_id', ids)
        .eq('is_active', true);

      const counts = new Map<string, number>();
      (seats ?? []).forEach((s) => {
        if (!s.table_map_id) return;
        counts.set(s.table_map_id, (counts.get(s.table_map_id) ?? 0) + 1);
      });

      return maps.map((m) => ({
        ...m,
        orientation: m.orientation as 'landscape' | 'portrait',
        seats_count: counts.get(m.id) ?? 0,
      }));
    },
  });
}

export function useCreateTableMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      venue_id,
      name,
    }: {
      venue_id: string;
      name: string;
    }): Promise<TableMap> => {
      const { data, error } = await supabase
        .from('table_maps')
        .insert({
          venue_id,
          name: name.trim(),
          canvas_width: 1200,
          canvas_height: 800,
          background_color: '#ffffff',
          orientation: 'landscape',
        })
        .select()
        .single();
      if (error) throw error;
      return data as TableMap;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['table_maps', vars.venue_id] });
      toast.success('Mapa criado');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao criar mapa'),
  });
}

export function useUpdateTableMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      formData,
    }: {
      id: string;
      formData: TableMapFormData;
    }) => {
      // NOTE: orientation is intentionally NOT editable here — only via the editor's
      // "Girar 90°" action which recomputes seat positions atomically.
      const { error } = await supabase
        .from('table_maps')
        .update({
          name: formData.name.trim(),
          background_color: formData.background_color || '#ffffff',
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['table_maps'] });
      toast.success('Mapa atualizado');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar mapa'),
  });
}

export function useSoftDeleteTableMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('table_maps')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['table_maps'] });
      toast.success('Mapa removido');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao remover mapa'),
  });
}
