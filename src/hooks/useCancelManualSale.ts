import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useCancelManualSale(eventId?: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ order_id, reason }: { order_id: string; reason: string }) => {
      const { data, error } = await supabase.functions.invoke('producer-cancel-manual-sale', {
        body: { order_id, reason },
      });
      if (error) throw new Error(error.message);
      if (!data || data.ok !== true) {
        const e: any = new Error(data?.error || 'Erro ao cancelar venda');
        e.code = data?.code;
        throw e;
      }
      return data as { ok: true; already_cancelled?: boolean };
    },
    onSuccess: (data) => {
      if (data.already_cancelled) {
        toast.info('Venda já estava cancelada.');
      } else {
        toast.success('Venda cancelada e estoque devolvido.');
      }
      if (eventId) {
        qc.invalidateQueries({ queryKey: ['event-orders', eventId] });
        qc.invalidateQueries({ queryKey: ['event-lots', eventId] });
        qc.invalidateQueries({ queryKey: ['event-stats', eventId] });
      }
    },
    onError: (err: any) => {
      const codeMap: Record<string, string> = {
        ticket_already_used: 'Não é possível cancelar: algum ingresso já foi validado no check-in.',
        forbidden: 'Você não tem permissão para cancelar esta venda.',
        not_manual: 'Esta venda não é manual e deve seguir o fluxo de reembolso.',
        invalid_status: 'A venda não está em estado pago e não pode ser cancelada.',
      };
      toast.error(codeMap[err.code] || err.message || 'Erro ao cancelar venda.');
    },
  });
}
