import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ManualSaleItem {
  lot_id: string;
  quantity: number;
}

export interface ManualSaleInput {
  event_id: string;
  buyer: {
    name: string;
    cpf: string;
    email: string;
    whatsapp?: string | null;
  };
  items: ManualSaleItem[];
  coupon_code?: string | null;
  // Na cortesia (is_courtesy=true) não vão método/taxa/cupom — o servidor força zero.
  payment_method?: 'pix' | 'dinheiro' | 'transferencia' | 'cartao' | 'outro';
  apply_fee?: boolean;
  note?: string | null;
  is_courtesy?: boolean;
}

export interface ManualSaleResult {
  ok: true;
  order_id: string;
  tickets: { id: string; ticket_code: string; lot_name: string }[];
  totals: { subtotal: number; service_fee: number; discount: number; total: number };
  customer: { name: string; email: string; whatsapp: string | null };
  email_sent: boolean;
}

export function useManualSale(eventId?: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ManualSaleInput): Promise<ManualSaleResult> => {
      const { data, error } = await supabase.functions.invoke('producer-create-manual-sale', {
        body: input,
      });
      if (error) throw new Error(error.message);
      if (!data || data.ok !== true) {
        const e: any = new Error(data?.error || 'Erro ao registrar venda manual');
        e.code = data?.code;
        e.lot_id = data?.lot_id;
        throw e;
      }
      return data as ManualSaleResult;
    },
    onSuccess: () => {
      if (eventId) {
        qc.invalidateQueries({ queryKey: ['event-orders', eventId] });
        qc.invalidateQueries({ queryKey: ['event-lots', eventId] });
        qc.invalidateQueries({ queryKey: ['event-stats', eventId] });
      }
    },
  });
}
