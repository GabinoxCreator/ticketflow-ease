import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Venue {
  id: string;
  producer_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  capacity: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  maps_count?: number;
}

export interface VenueFormData {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  capacity?: number | null;
  notes?: string | null;
}

export function useVenues() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['venues', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Venue[]> => {
      if (!user?.id) return [];
      const { data: venues, error } = await supabase
        .from('venues')
        .select('*')
        .eq('producer_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!venues || venues.length === 0) return [];

      const ids = venues.map((v) => v.id);
      const { data: maps } = await supabase
        .from('table_maps')
        .select('venue_id')
        .in('venue_id', ids)
        .eq('is_active', true);

      const counts = new Map<string, number>();
      (maps ?? []).forEach((m) => {
        counts.set(m.venue_id, (counts.get(m.venue_id) ?? 0) + 1);
      });

      return venues.map((v) => ({ ...v, maps_count: counts.get(v.id) ?? 0 }));
    },
  });
}

export function useCreateVenue() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (formData: VenueFormData): Promise<Venue> => {
      if (!user?.id) throw new Error('Não autenticado');
      const { data, error } = await supabase
        .from('venues')
        .insert({
          producer_id: user.id,
          name: formData.name.trim(),
          address: formData.address?.trim() || null,
          city: formData.city?.trim() || null,
          state: formData.state?.trim() || null,
          capacity: formData.capacity ?? null,
          notes: formData.notes?.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Venue;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venues'] });
      toast.success('Local criado');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao criar local'),
  });
}

export function useUpdateVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: VenueFormData }) => {
      const { error } = await supabase
        .from('venues')
        .update({
          name: formData.name.trim(),
          address: formData.address?.trim() || null,
          city: formData.city?.trim() || null,
          state: formData.state?.trim() || null,
          capacity: formData.capacity ?? null,
          notes: formData.notes?.trim() || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venues'] });
      toast.success('Local atualizado');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar local'),
  });
}

export function useSoftDeleteVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Block if there are active table_maps
      const { count, error: countError } = await supabase
        .from('table_maps')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', id)
        .eq('is_active', true);
      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error(`Este local tem ${count} mapa(s). Remova os mapas primeiro.`);
      }
      const { error } = await supabase
        .from('venues')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venues'] });
      toast.success('Local removido');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao remover local'),
  });
}

export function useVenueById(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue', venueId],
    enabled: !!venueId,
    queryFn: async (): Promise<Venue | null> => {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .eq('id', venueId!)
        .maybeSingle();
      if (error) throw error;
      return data as Venue | null;
    },
  });
}
