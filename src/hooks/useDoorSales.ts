import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DoorSale {
  id: string;
  event_id: string;
  lot_id: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  payment_method: string;
  notes: string | null;
  operator_id: string;
  created_at: string;
  lot?: { name: string };
}

export interface DoorSaleInput {
  event_id: string;
  lot_id: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  payment_method: string;
  notes?: string;
}

export function useDoorSales(eventId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: sales, isLoading } = useQuery({
    queryKey: ['door-sales', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('door_sales')
        .select('*, lot:event_lots(name)')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DoorSale[];
    },
    enabled: !!eventId,
  });

  const createSale = useMutation({
    mutationFn: async (input: DoorSaleInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data, error } = await supabase
        .from('door_sales')
        .insert({ ...input, operator_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['door-sales', eventId] });
      queryClient.invalidateQueries({ queryKey: ['event-lots', eventId] });
      queryClient.invalidateQueries({ queryKey: ['event-participants', eventId] });
      toast.success('Venda de portaria registrada!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao registrar venda: ${error.message}`);
    },
  });

  const totalDoorRevenue = sales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
  const totalDoorTickets = sales?.reduce((sum, s) => sum + s.quantity, 0) || 0;

  return { sales, isLoading, createSale, totalDoorRevenue, totalDoorTickets };
}
