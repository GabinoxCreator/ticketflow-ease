import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { supabasePublic } from '@/integrations/supabase/publicClient';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface EventLot {
  id: string;
  event_id: string;
  name: string;
  price: number;
  original_price: number | null;
  total_quantity: number;
  sold_quantity: number;
  reserved_quantity: number;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  fake_scarcity_enabled: boolean | null;
  fake_scarcity_percentage: number | null;
  sector_name: string;
  group_ticket_enabled: boolean;
  group_ticket_quantity: number;
  sales_start_type: string;
  starts_after_lot_id: string | null;
  manually_sold_out: boolean;
}

export interface LotFormData {
  name: string;
  price: number;
  original_price?: number;
  total_quantity: number;
  start_date?: string;
  end_date?: string;
  description?: string;
  is_active?: boolean;
  fake_scarcity_enabled?: boolean;
  fake_scarcity_percentage?: number;
  sector_name?: string;
  group_ticket_enabled?: boolean;
  group_ticket_quantity?: number;
  sales_start_type?: string;
  starts_after_lot_id?: string | null;
  manually_sold_out?: boolean;
}

export function useEventLots(eventId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: lots, isLoading, error } = useQuery({
    // O usuário entra na chave: sem isso, a lista carregada antes do login
    // (sem rascunho) ficaria em cache e o painel continuaria vazio.
    queryKey: ['event-lots', eventId, user?.id ?? 'anon'],
    queryFn: async () => {
      if (!eventId) return [];

      // ⚠️ QUEM LÊ MUDA O QUE APARECE.
      //
      // A regra do banco libera lote de evento PUBLICADO para qualquer um, e
      // lote de evento em rascunho só para o dono. O client público não leva
      // sessão, então `auth.uid()` chega vazio e o rascunho some — inclusive
      // para o produtor, no painel dele. Foi assim que os 18 lotes do rodeio
      // ficaram invisíveis: existiam no banco e a tela dizia "nenhum setor
      // criado ainda".
      //
      // Com sessão, usa o client autenticado (enxerga o rascunho do dono). Sem
      // sessão, segue no público, que não espera refresh de token — é o caminho
      // da página do evento, onde a velocidade importa e só há publicado.
      const client = user ? supabase : supabasePublic;

      const { data, error } = await client
        .from('event_lots')
        .select('*')
        .eq('event_id', eventId)
        .order('price', { ascending: true });

      if (error) throw error;
      return data as EventLot[];
    },
    enabled: !!eventId,
  });

  const createLot = useMutation({
    mutationFn: async (lotData: LotFormData) => {
      if (!eventId) throw new Error('ID do evento não fornecido');

      const { data, error } = await supabase
        .from('event_lots')
        .insert({
          ...lotData,
          event_id: eventId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-lots', eventId] });
      toast.success('Lote criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar lote: ${error.message}`);
    },
  });

  const updateLot = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LotFormData> }) => {
      const { data: updatedLot, error } = await supabase
        .from('event_lots')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return updatedLot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-lots', eventId] });
      toast.success('Lote atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar lote: ${error.message}`);
    },
  });

  const deleteLot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_lots')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-lots', eventId] });
      toast.success('Lote excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir lote: ${error.message}`);
    },
  });

  const totalQuantity = lots?.reduce((acc, lot) => acc + lot.total_quantity, 0) || 0;
  const soldQuantity = lots?.reduce((acc, lot) => acc + lot.sold_quantity, 0) || 0;
  const reservedQuantity = lots?.reduce((acc, lot) => acc + (lot.reserved_quantity || 0), 0) || 0;
  const availableQuantity = totalQuantity - soldQuantity - reservedQuantity;

  return {
    lots,
    isLoading,
    error,
    createLot,
    updateLot,
    deleteLot,
    totalQuantity,
    soldQuantity,
    availableQuantity,
  };
}
