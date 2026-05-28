import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { EventSeatRow } from './useEventSeats';

export interface HoldState {
  token: string;
  expiresAt: string;
  seatIds: string[];
}

const storageKey = (eventId: string) => `festpag:hold:${eventId}`;

interface HoldRpcResult {
  hold_token: string;
  expires_at: string;
}

export function useSeatHold(eventId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  const [hold, setHold] = useState<HoldState | null>(null);
  const holdRef = useRef<HoldState | null>(null);
  const isProceedingRef = useRef(false);

  useEffect(() => {
    holdRef.current = hold;
  }, [hold]);

  // Hidratação do sessionStorage
  useEffect(() => {
    if (!eventId) return;
    const raw = sessionStorage.getItem(storageKey(eventId));
    if (!raw) return;
    try {
      const parsed: HoldState = JSON.parse(raw);
      if (new Date(parsed.expiresAt).getTime() > Date.now()) {
        setHold(parsed);
      } else {
        sessionStorage.removeItem(storageKey(eventId));
      }
    } catch {
      sessionStorage.removeItem(storageKey(eventId));
    }
  }, [eventId]);

  // Expiração local: 1 setTimeout único, sem polling
  useEffect(() => {
    if (!hold || !eventId) return;
    const ms = new Date(hold.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      sessionStorage.removeItem(storageKey(eventId));
      setHold(null);
      queryClient.invalidateQueries({ queryKey: ['event-seats', eventId] });
      return;
    }
    const t = setTimeout(() => {
      sessionStorage.removeItem(storageKey(eventId));
      setHold(null);
      queryClient.invalidateQueries({ queryKey: ['event-seats', eventId] });
      toast.info('Tempo esgotado. Selecione novamente.');
    }, ms);
    return () => clearTimeout(t);
  }, [hold, eventId, queryClient]);

  const holdSelected = useCallback(
    async (seatIds: string[]): Promise<HoldState | null> => {
      if (!eventId || !seatIds.length) return null;
      const { data, error } = await supabase.rpc('hold_seats', {
        _event_id: eventId,
        _seat_ids: seatIds,
      });
      if (error) {
        const msg = error.message || '';
        if (msg.includes('seats_unavailable')) {
          toast.error('Alguém pegou esses assentos antes de você');
          queryClient.invalidateQueries({ queryKey: ['event-seats', eventId] });
        } else if (msg.includes('not_authenticated')) {
          toast.error('Faça login para reservar assentos');
        } else {
          toast.error('Erro ao reservar assentos');
        }
        return null;
      }
      const result = data as unknown as HoldRpcResult;
      const next: HoldState = {
        token: result.hold_token,
        expiresAt: result.expires_at,
        seatIds,
      };
      sessionStorage.setItem(storageKey(eventId), JSON.stringify(next));
      setHold(next);

      // Merge otimista: marca como 'held' na cache pra evitar flash de "available"
      // até o realtime UPDATE chegar.
      if (userId) {
        queryClient.setQueryData<EventSeatRow[] | undefined>(
          ['event-seats', eventId],
          (prev) =>
            prev
              ? prev.map((s) =>
                  seatIds.includes(s.id)
                    ? {
                        ...s,
                        status: 'held' as const,
                        held_by_user_id: userId,
                        hold_expires_at: next.expiresAt,
                        hold_token: next.token,
                      }
                    : s
                )
              : prev
        );
      }
      return next;
    },
    [eventId, userId, queryClient]
  );

  const releaseCurrent = useCallback(async () => {
    const cur = holdRef.current;
    if (!cur || !eventId) return;
    await supabase.rpc('release_seats', {
      _event_id: eventId,
      _hold_token: cur.token,
    });
    sessionStorage.removeItem(storageKey(eventId));
    setHold(null);
    queryClient.invalidateQueries({ queryKey: ['event-seats', eventId] });
  }, [eventId, queryClient]);

  // Fase 9 vai chamar isso colado ao navigate('/checkout/...').
  // NÃO chamar no stub desta fase.
  const markProceeding = useCallback(() => {
    isProceedingRef.current = true;
  }, []);

  // Cleanup no unmount — usa holdRef.current, não closure de hold.
  // Não solta se markProceeding() foi chamado (usuário saiu pro checkout).
  useEffect(() => {
    return () => {
      const cur = holdRef.current;
      if (!isProceedingRef.current && cur && eventId) {
        supabase.rpc('release_seats', {
          _event_id: eventId,
          _hold_token: cur.token,
        });
        sessionStorage.removeItem(storageKey(eventId));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return { hold, holdSelected, releaseCurrent, markProceeding };
}
