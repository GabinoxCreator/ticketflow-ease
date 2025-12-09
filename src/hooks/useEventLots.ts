import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface EventLot {
  id: string;
  event_id: string;
  name: string;
  price: number;
  original_price: number | null;
  total_quantity: number;
  sold_quantity: number;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LotFormData {
  name: string;
  price: number;
  original_price?: number;
  total_quantity: number;
  start_date?: string;
  end_date?: string;
  description?: string;
  is_active?: boolean;
}

export function useEventLots(eventId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: lots, isLoading, error } = useQuery({
    queryKey: ['event-lots', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      
      const { data, error } = await supabase
        .from('event_lots')
        .select('*')
        .eq('event_id', eventId)
        .order('price', { ascending: true });

      if (error) throw error;
      return data as EventLot[];
    },
    enabled: !!eventId,
  });

  const createLot = useMutation({
    mutationFn: async (lotData: LotFormData) => {
      if (!eventId) throw new Error('ID do evento não fornecido');

      const { data, error } = await supabase
        .from('event_lots')
        .insert({
          ...lotData,
          event_id: eventId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-lots', eventId] });
      toast.success('Lote criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar lote: ${error.message}`);
    },
  });

  const updateLot = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LotFormData> }) => {
      const { data: updatedLot, error } = await supabase
        .from('event_lots')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return updatedLot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-lots', eventId] });
      toast.success('Lote atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar lote: ${error.message}`);
    },
  });

  const deleteLot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_lots')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-lots', eventId] });
      toast.success('Lote excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir lote: ${error.message}`);
    },
  });

  const totalQuantity = lots?.reduce((acc, lot) => acc + lot.total_quantity, 0) || 0;
  const soldQuantity = lots?.reduce((acc, lot) => acc + lot.sold_quantity, 0) || 0;
  const availableQuantity = totalQuantity - soldQuantity;

  return {
    lots,
    isLoading,
    error,
    createLot,
    updateLot,
    deleteLot,
    totalQuantity,
    soldQuantity,
    availableQuantity,
  };
}
