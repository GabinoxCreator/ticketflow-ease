import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Order {
  id: string;
  event_id: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  total_amount: number;
  status: 'pending' | 'paid' | 'completed' | 'cancelled' | 'refunded' | 'failed' | 'expired' | 'charged_back';
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

export function useEventOrders(eventId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: orders, isLoading, error } = useQuery({
    queryKey: ['event-orders', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Order[];
    },
    enabled: !!eventId,
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: Order['status'] }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-orders', eventId] });
      toast.success('Status do pedido atualizado!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar pedido: ${error.message}`);
    },
  });

  const paidOrders = orders?.filter(o => o.status === 'paid' || o.status === 'completed') || [];
  const pendingOrders = orders?.filter(o => o.status === 'pending') || [];
  const cancelledOrders = orders?.filter(o => ['cancelled','refunded','failed','expired','charged_back'].includes(o.status)) || [];
  const failedOrders = orders?.filter(o => o.status === 'failed') || [];

  const totalRevenue = paidOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);

  return {
    orders,
    paidOrders,
    pendingOrders,
    cancelledOrders,
    failedOrders,
    totalRevenue,
    isLoading,
    error,
    updateOrderStatus,
  };
}
