import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { supabasePublic } from '@/integrations/supabase/publicClient';

export interface EventSeatRow {
  id: string;
  event_id: string;
  status: 'available' | 'held' | 'sold' | 'blocked' | 'manual';
  hold_expires_at: string | null;
  code: string | null;
  label: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  radius: number | null;
  rotation: number;
  shape: string | null;
  color: string | null;
  icon: string | null;
  seat_type_name: string | null;
  base_price: number | null;
  extra_price: number | null;
  base_capacity: number | null;
  max_capacity: number | null;
}

// LGPD/segurança: held_by_user_id (PII) e hold_token (SEGREDO do hold) ficaram
// FORA do select — ninguém no front os lê ("meu assento" vem do estado local do
// useSeatHold; o token vem da resposta da RPC hold_seats). No banco, grants de
// coluna + column list na publication do realtime garantem o mesmo por fora.
const SEAT_COLS =
  'id,event_id,status,hold_expires_at,' +
  'code,label,x,y,width,height,radius,rotation,shape,color,icon,' +
  'seat_type_name,base_price,extra_price,base_capacity,max_capacity';


export function useEventSeats(eventId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ['event-seats', eventId];

  const query = useQuery({
    queryKey: key,
    enabled: !!eventId,
    queryFn: async () => {
      // Leitura pública: client sem sessão, não espera o refresh de token.
      // (O realtime channel abaixo segue no supabase autenticado.)
      const { data, error } = await supabasePublic
        .from('event_seats')
        .select(SEAT_COLS)
        .eq('event_id', eventId!);
      if (error) throw error;
      return (data ?? []) as unknown as EventSeatRow[];
    },
  });

  // Realtime: UPDATE-only. Seats não nascem nem somem com a página aberta.
  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`event_seats:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'event_seats',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const next = payload.new as EventSeatRow;
          queryClient.setQueryData<EventSeatRow[] | undefined>(key, (prev) =>
            prev ? prev.map((s) => (s.id === next.id ? { ...s, ...next } : s)) : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return query;
}
