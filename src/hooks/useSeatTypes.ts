import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type SeatTypeRow = Database['public']['Tables']['seat_types']['Row'];
type SeatTypeInsert = Database['public']['Tables']['seat_types']['Insert'];
type SeatTypeUpdate = Database['public']['Tables']['seat_types']['Update'];

export interface SeatType extends SeatTypeRow {}

export interface SeatTypeFormData {
  name: string;
  description?: string;
  base_capacity: number;
  max_capacity: number;
  base_price?: number;
  extra_price?: number;
  shape?: 'rect' | 'circle';
  default_width?: number;
  default_height?: number;
  default_color?: string | null;
  icon?: string | null;
  is_active?: boolean;
}

export function useSeatTypes() {
  const queryClient = useQueryClient();

  const { data: seatTypes, isLoading, error } = useQuery({
    queryKey: ['seat-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seat_types')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data as SeatType[];
    },
  });

  const createSeatType = useMutation({
    mutationFn: async (formData: SeatTypeFormData) => {
      const { data: userData } = await supabase.auth.getUser();
      const producer_id = userData.user?.id;
      if (!producer_id) throw new Error('Usuário não autenticado');

      const insertData: SeatTypeInsert = {
        ...formData,
        producer_id,
        base_price: formData.base_price ?? 0,
        extra_price: formData.extra_price ?? 0,
        shape: formData.shape ?? 'rect',
        default_width: formData.default_width ?? 80,
        default_height: formData.default_height ?? 80,
        default_color: formData.default_color ?? '#3b82f6',
        is_active: formData.is_active ?? true,
      };

      const { data, error } = await supabase
        .from('seat_types')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-types'] });
      toast.success('Tipo de assento criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar tipo de assento: ${error.message}`);
    },
  });

  const updateSeatType = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SeatTypeFormData> }) => {
      const updateData: SeatTypeUpdate = {
        ...data,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error } = await supabase
        .from('seat_types')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-types'] });
      toast.success('Tipo de assento atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar tipo de assento: ${error.message}`);
    },
  });

  const deleteSeatType = useMutation({
    mutationFn: async (id: string) => {
      // Guard: verificar se está em uso em venue_seats
      const { count, error: countError } = await supabase
        .from('venue_seats')
        .select('id', { count: 'exact', head: true })
        .eq('seat_type_id', id);

      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error('Este tipo de assento está em uso em um ou mais mapas e não pode ser excluído.');
      }

      const { error } = await supabase
        .from('seat_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-types'] });
      toast.success('Tipo de assento excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    seatTypes,
    isLoading,
    error,
    createSeatType,
    updateSeatType,
    deleteSeatType,
  };
}
