import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEventLots } from './useEventLots';

export interface DoorSaleReport {
  totals: { tickets: number; revenue: number; sales: number; ticketMedio: number };
  byLot: { lot_id: string; name: string; qty: number; revenue: number }[];
  byMethod: { method: string; qty: number; revenue: number; sales: number }[];
  byOperator: { operator_id: string; name: string; qty: number; revenue: number; sales: number }[];
  recent: {
    id: string; quantity: number; unit_price: number; total_amount: number;
    payment_method: string; created_at: string; lot_name: string;
  }[];
}

export function useColaboradorLots(eventId: string) {
  return useEventLots(eventId);
}

export function useColaboradorDoorSalesReport(
  eventId: string,
  collaboratorId: string,
  sessionToken: string,
  onSessionExpired?: () => void
) {
  return useQuery<DoorSaleReport>({
    queryKey: ['colaborador-door-sales-report', eventId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('collaborator-door-sales-report', {
        body: { event_id: eventId, collaborator_id: collaboratorId, session_token: sessionToken },
      });
      if (error) throw error;
      if ((data as any)?.session_expired) {
        onSessionExpired?.();
        throw new Error('Sessão expirada');
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as DoorSaleReport;
    },
    enabled: !!eventId && !!collaboratorId && !!sessionToken,
    refetchInterval: 30_000,
  });
}

export function useRegisterDoorSale(
  collaboratorId: string,
  sessionToken: string,
  onSessionExpired?: () => void
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      event_id: string;
      lot_id: string;
      quantity: number;
      payment_method: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('collaborator-register-door-sale', {
        body: { ...input, collaborator_id: collaboratorId, session_token: sessionToken },
      });
      if (error) throw error;
      if ((data as any)?.session_expired) {
        onSessionExpired?.();
        throw new Error((data as any).error || 'Sessão expirada');
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any).sale;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['colaborador-door-sales-report', vars.event_id] });
      qc.invalidateQueries({ queryKey: ['event-lots', vars.event_id] });
    },
  });
}
