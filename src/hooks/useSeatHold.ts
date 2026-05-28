import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { EventSeatRow } from './useEventSeats';

export interface HoldState {
  token: string;
  expiresAt: string;
  seatIds: string[];
  addons: Record<string, number>;
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

  const persist = useCallback((next: HoldState | null) => {
    if (!eventId) return;
    if (next) sessionStorage.setItem(storageKey(eventId), JSON.stringify(next));
    else sessionStorage.removeItem(storageKey(eventId));
  }, [eventId]);

  // Hidratação do sessionStorage
  useEffect(() => {
    if (!eventId) return;
    const raw = sessionStorage.getItem(storageKey(eventId));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<HoldState>;
      if (parsed?.token && parsed?.expiresAt && Array.isArray(parsed.seatIds) &&
          new Date(parsed.expiresAt).getTime() > Date.now()) {
        setHold({
          token: parsed.token,
          expiresAt: parsed.expiresAt,
          seatIds: parsed.seatIds,
          addons: parsed.addons ?? {},
        });
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
      persist(null);
      setHold(null);
      queryClient.invalidateQueries({ queryKey: ['event-seats', eventId] });
      return;
    }
    const t = setTimeout(() => {
      persist(null);
      setHold(null);
      queryClient.invalidateQueries({ queryKey: ['event-seats', eventId] });
      toast.info('Tempo esgotado. Selecione novamente.');
    }, ms);
    return () => clearTimeout(t);
  }, [hold, eventId, queryClient, persist]);

  const holdSelected = useCallback(
    async (
      seatIds: string[],
      initialAddons?: Record<string, number>,
    ): Promise<HoldState | null> => {
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
        addons: initialAddons ? { ...initialAddons } : {},
      };
      persist(next);
      setHold(next);

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
    [eventId, userId, queryClient, persist]
  );


  const setSeatAddon = useCallback((seatId: string, qty: number) => {
    setHold((prev) => {
      if (!prev) return prev;
      const next: HoldState = {
        ...prev,
        addons: { ...prev.addons, [seatId]: Math.max(0, Math.floor(qty)) },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  // Atualiza expiresAt com o valor AUTORITATIVO do servidor (event_seats.hold_expires_at
  // estendido por create_seat_order). No-op se null/undefined. Sem fallback client-side.
  const updateHoldExpiresAt = useCallback((newIso: string | null | undefined) => {
    if (!newIso) return;
    setHold((prev) => {
      if (!prev) return prev;
      const next: HoldState = { ...prev, expiresAt: newIso };
      persist(next);
      return next;
    });
  }, [persist]);

  const releaseCurrent = useCallback(async () => {
    const cur = holdRef.current;
    if (!cur || !eventId) return;
    await supabase.rpc('release_seats', {
      _event_id: eventId,
      _hold_token: cur.token,
    });
    persist(null);
    setHold(null);
    queryClient.invalidateQueries({ queryKey: ['event-seats', eventId] });
  }, [eventId, queryClient, persist]);

  // Limpa apenas o hold LOCAL (state + storage). Não chama release no servidor.
  // Usado em success/rejected: o servidor já promoveu (sold) ou já liberou (release_seats_for_order).
  // Como holdRef.current vira null, o cleanup do unmount não dispara release.
  const clearLocalHold = useCallback(() => {
    persist(null);
    setHold(null);
  }, [persist]);

  // Chamar IMEDIATAMENTE antes do navigate pro checkout. Latch ref pra que o
  // cleanup do unmount não solte o hold do servidor.
  const markProceeding = useCallback(() => {
    isProceedingRef.current = true;
  }, []);

  // Cleanup no unmount — usa holdRef.current, não closure de hold.
      // Não solta se markProceeding foi chamado (usuário saiu pro checkout)
  // nem se clearLocalHold() já zerou o hold (terminal success/rejected).
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

  return {
    hold,
    addons: hold?.addons ?? {},
    holdSelected,
    setSeatAddon,
    updateHoldExpiresAt,
    releaseCurrent,
    clearLocalHold,
    markProceeding,
  };
}
