import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface EventCoupon {
  id: string;
  event_id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  uses_count: number;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CouponFormData {
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_uses?: number | null;
  valid_until?: string | null;
  is_active?: boolean;
}

// OS-420: o banco recusa cupom com o mesmo código de outro do evento, mesmo que
// a diferença seja só espaço ou acento ("PACHA 10" e "PACHÁ10"), com o erro
// 23505 (o gatilho `event_coupons_trava_duplicata` e o índice único).
const FRASE_DUPLICADO = 'Já existe um cupom com esse código neste evento.';

function mensagemDoErro(e: any): string {
  if (e?.code === '23505') return FRASE_DUPLICADO;
  return e?.message || 'tente de novo';
}

export function useEventCoupons(eventId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['event-coupons', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('event_coupons' as any)
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as EventCoupon[];
    },
    enabled: !!eventId,
  });

  const createCoupon = useMutation({
    mutationFn: async (data: CouponFormData) => {
      if (!eventId) throw new Error('Evento inválido');
      const payload = {
        ...data,
        code: data.code.trim().toUpperCase(),
        event_id: eventId,
      };
      const { data: row, error } = await supabase
        .from('event_coupons' as any)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-coupons', eventId] });
      toast.success('Cupom criado com sucesso!');
    },
    onError: (e: any) => {
      const msg = mensagemDoErro(e);
      toast.error(msg === FRASE_DUPLICADO ? msg : `Erro ao criar cupom: ${msg}`);
    },
  });

  const updateCoupon = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CouponFormData> }) => {
      const payload: any = { ...data };
      if (payload.code) payload.code = payload.code.trim().toUpperCase();
      const { data: row, error } = await supabase
        .from('event_coupons' as any)
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-coupons', eventId] });
      toast.success('Cupom atualizado!');
    },
    onError: (e: any) => {
      const msg = mensagemDoErro(e);
      toast.error(msg === FRASE_DUPLICADO ? msg : `Erro ao atualizar: ${msg}`);
    },
  });

  const deleteCoupon = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('event_coupons' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-coupons', eventId] });
      toast.success('Cupom excluído');
    },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  return {
    coupons: query.data || [],
    isLoading: query.isLoading,
    createCoupon,
    updateCoupon,
    deleteCoupon,
  };
}
