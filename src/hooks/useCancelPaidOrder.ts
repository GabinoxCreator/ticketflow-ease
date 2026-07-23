import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Cancelamento MANUAL de pedido pago (online). NÃO estorna — só ajusta o sistema.
// Usa raw fetch (não functions.invoke) pra ler o corpo real em respostas non-2xx.
export function useCancelPaidOrder(eventId?: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ order_id, reason }: { order_id: string; reason?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sessão expirada. Entre novamente.');

      const url = import.meta.env.VITE_SUPABASE_URL;
      const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${url}/functions/v1/producer-cancel-paid-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anon,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id, ...(reason ? { reason } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok !== true) {
        const e: any = new Error(data?.error || 'Erro ao cancelar pedido');
        e.code = data?.code;
        throw e;
      }
      return data as { ok: true; already_applied?: boolean };
    },
    onSuccess: (data) => {
      if (data.already_applied) {
        toast.info('Pedido já estava cancelado.');
      } else {
        toast.success('Pedido cancelado e estoque devolvido. O reembolso é manual.');
      }
      if (eventId) {
        qc.invalidateQueries({ queryKey: ['event-orders', eventId] });
        qc.invalidateQueries({ queryKey: ['event-lots', eventId] });
        qc.invalidateQueries({ queryKey: ['event-stats', eventId] });
        qc.invalidateQueries({ queryKey: ['event-financeiro', eventId] });
      }
    },
    onError: (err: any) => {
      const codeMap: Record<string, string> = {
        forbidden: 'Você não tem permissão para cancelar este pedido.',
        invalid_status: 'O pedido não está pago e não pode ser cancelado por aqui.',
        order_not_found: 'Pedido não encontrado.',
      };
      toast.error(codeMap[err.code] || err.message || 'Erro ao cancelar pedido.');
    },
  });
}
