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
  customer_cpf?: string | null;
  total_amount: number;
  service_fee_amount?: number;
  status: 'pending' | 'paid' | 'completed' | 'cancelled' | 'refunded' | 'failed' | 'expired' | 'charged_back';
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  sale_origin?: 'online' | 'manual';
  manual_payment_method?: string | null;
  manual_payment_note?: string | null;
  manual_sold_by?: string | null;
  manual_fee_applied?: boolean;
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

  // SAFETY (Parte 2.1): manual mutation of orders.status from the client is
  // disabled. Transitions to paid/refunded/cancelled/failed/expired affect
  // tickets and inventory and MUST go through server-side flows
  // (mercadopago-webhook, expire-pending-orders, reconcile-orphan-orders).
  // Re-enabling requires a dedicated server-side endpoint with audit.
  const updateOrderStatus = useMutation({
    mutationFn: async (_args: { orderId: string; status: Order['status'] }) => {
      throw new Error(
        'Alteração manual do status do pedido está desabilitada. ' +
        'Use os fluxos automáticos (webhook, expiração, reconciliação).'
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const paidOrders = orders?.filter(o => o.status === 'paid' || o.status === 'completed') || [];
  const pendingOrders = orders?.filter(o => o.status === 'pending') || [];
  const cancelledOrders = orders?.filter(o => ['cancelled','refunded','failed','expired','charged_back'].includes(o.status)) || [];
  const failedOrders = orders?.filter(o => o.status === 'failed') || [];

  const totalRevenue = paidOrders.reduce((sum, order) => sum + (Number(order.total_amount) - Number(order.service_fee_amount || 0)), 0);

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
