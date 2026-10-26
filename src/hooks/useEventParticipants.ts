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
  status: 'pending' | 'valid' | 'used' | 'cancelled';
  validated_at: string | null;
  created_at: string;
  lot?: {
    name: string;
    price: number;
  };
  /** Pedido do ingresso (só o estado), para separar tentativa não paga de cancelamento de verdade. */
  order?: { status: string } | null;
}

/** Status que a tela pede → passagem que a função `produtor_mudar_ingresso` aceita. */
const ACAO_POR_STATUS: Partial<Record<Ticket['status'], string>> = {
  used: 'validar',
  valid: 'desfazer_validacao',
  cancelled: 'cancelar',
};

/** Recusa da função em português de dono (o código cru fica no console). */
function mensagemDoErro(bruta: string | undefined): string {
  const m = bruta ?? '';
  if (m.includes('ingresso_em_reembolso')) return 'Este ingresso tem um pedido de reembolso em análise e está bloqueado.';
  if (m.includes('passagem_nao_permitida')) return 'Este ingresso não pode mudar assim (cancelado não volta; pedido não pago não faz check-in).';
  if (m.includes('ingresso_nao_encontrado')) return 'Ingresso não encontrado neste evento.';
  if (m.includes('nao_autenticado')) return 'Sua sessão caiu. Entre de novo.';
  console.error('[produtor_mudar_ingresso]', m);
  return 'Não deu para mudar o ingresso. Tente de novo.';
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
          lot:event_lots(name, price),
          order:orders(status)
        `)
        .eq('event_id', eventId)
        // Apenas tickets de quem efetivamente comprou (exclui pending)
        .in('status', ['valid', 'used', 'cancelled'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Ingresso de tentativa (PIX que venceu ou cartão recusado) não é ingresso
      // cancelado: o comprador nunca pagou. Só aparece o de pedido pago, reembolsado
      // ou cancelado de verdade (OS-155).
      return (data as Ticket[]).filter(
        (t) => !(t.status === 'cancelled' && t.order && ['expired', 'failed'].includes(t.order.status)),
      );
    },
    enabled: !!eventId,
  });

  // O produtor não escreve mais na tabela de ingressos (OS-265): check-in,
  // desfazer o check-in e cancelar passam pela função da casa, que confere o
  // dono do evento e só aceita essas três passagens. Ingresso cancelado não volta.
  const updateTicketStatus = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: Ticket['status'] }) => {
      const acao = ACAO_POR_STATUS[status];
      if (!acao) throw new Error('Essa mudança não é permitida neste ingresso.');

      // A função ainda não está nos tipos gerados (types.ts é do Lovable).
      const rpcSemTipo = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      const { data, error } = await rpcSemTipo.call(supabase, 'produtor_mudar_ingresso', {
        _ticket_id: ticketId,
        _acao: acao,
      });

      if (error) throw new Error(mensagemDoErro(error.message));
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
