import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrderTicket {
  id: string;
  status: string;
  holder_name: string;
  holder_email: string | null;
  seat_label: string | null;
  lot: { name: string; price: number } | null;
}

/**
 * Itens (tickets) de um pedido específico, buscados sob demanda ao abrir o
 * drawer de detalhe. Só dispara quando `enabled` (drawer aberto) para não
 * inflar a listagem de pedidos com N queries de tickets.
 */
export function useOrderTickets(orderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['order-tickets', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from('tickets')
        .select('id, status, holder_name, holder_email, seat_label, lot:event_lots(name, price)')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as OrderTicket[];
    },
    enabled: enabled && !!orderId,
  });
}
