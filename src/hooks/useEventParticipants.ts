import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Ticket {
  id: string;
  order_id: string;
  event_id: string;
  lot_id: string;
  user_id: string | null;
  holder_name: string;
  holder_email: string | null;
  holder_phone: string | null;
  ticket_code: string;
  status: 'valid' | 'used' | 'cancelled';
  validated_at: string | null;
  created_at: string;
  lot?: {
    name: string;
    price: number;
  };
}

export function useEventParticipants(eventId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: tickets, isLoading, error } = useQuery({
    queryKey: ['event-participants', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          lot:event_lots(name, price)
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Ticket[];
    },
    enabled: !!eventId,
  });

  const updateTicketStatus = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: Ticket['status'] }) => {
      const updateData: { status: Ticket['status']; validated_at?: string | null } = { status };
      
      if (status === 'used') {
        updateData.validated_at = new Date().toISOString();
      } else if (status === 'valid') {
        updateData.validated_at = null;
      }

      const { data, error } = await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-participants', eventId] });
      toast.success('Status do ingresso atualizado!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar ingresso: ${error.message}`);
    },
  });

  const validTickets = tickets?.filter(t => t.status === 'valid') || [];
  const usedTickets = tickets?.filter(t => t.status === 'used') || [];
  const cancelledTickets = tickets?.filter(t => t.status === 'cancelled') || [];

  return {
    tickets,
    validTickets,
    usedTickets,
    cancelledTickets,
    totalTickets: tickets?.length || 0,
    isLoading,
    error,
    updateTicketStatus,
  };
}
