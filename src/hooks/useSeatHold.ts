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
const orderStorageKey = (eventId: string) => `festpag:order:${eventId}`;

export function readStoredOrderId(eventId: string): string | null {
  try { return sessionStorage.getItem(orderStorageKey(eventId)); } catch { return null; }
}
export function writeStoredOrderId(eventId: string, orderId: string) {
  try { sessionStorage.setItem(orderStorageKey(eventId), orderId); } catch {}
}
export function clearStoredOrderId(eventId: string) {
  try { sessionStorage.removeItem(orderStorageKey(eventId)); } catch {}
}

interface HoldRpcResult {
  hold_token: string;
  expires_at: string;
}

type RpcSemTipo = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export interface HoldOpcoes {
  /** Passe da criança conferida (evento com lista de alunos, OS-346). */
  passe?: string;
  /** Recebe o código da recusa (`limite_do_aluno`, `venda_nao_abriu`, ...). */
  onErro?: (codigo: string) => void;
}

/** Recusas da trava por aluno (OS-346, OS-365). O servidor manda o código; a tela, o texto. */
export const CODIGOS_DA_TRAVA = ['aluno_obrigatorio', 'limite_do_aluno', 'venda_nao_abriu', 'sessao_do_aluno'] as const;
export type CodigoDaTrava = (typeof CODIGOS_DA_TRAVA)[number];
export const MENSAGEM_DA_TRAVA: Record<CodigoDaTrava, string> = {
  aluno_obrigatorio: 'Informe de novo o CPF do aluno.',
  limite_do_aluno: 'Os convites deste aluno já foram usados. Os que você já comprou estão em Meus Ingressos.',
  venda_nao_abriu: 'A venda para este aluno ainda não abriu.',
  // Só aparece sem `onErro`; no mapa do balé o recado tem o nome e a sessão.
  sessao_do_aluno: 'Os convites deste aluno são para a sessão em que dança.',
};

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
      opcoes?: HoldOpcoes,
    ): Promise<HoldState | null> => {
      if (!eventId || !seatIds.length) return null;
      // Evento com lista de alunos (OS-346): quem segura é a hold_seats_aluno,
      // com o passe da criança conferida. A hold_seats de sempre recusa esse
      // evento no servidor.
      const { data, error } = opcoes?.passe
        ? await (supabase.rpc as unknown as RpcSemTipo).call(supabase, 'hold_seats_aluno', {
            _event_id: eventId,
            _seat_ids: seatIds,
            _passe: opcoes.passe,
          })
        : await supabase.rpc('hold_seats', {
            _event_id: eventId,
            _seat_ids: seatIds,
          });
      if (error) {
        const msg = error.message || '';
        const codigoDaTrava = CODIGOS_DA_TRAVA.find((c) => msg.includes(c));
        // Com `onErro`, quem mostra o recado é a tela que chamou (no mapa do
        // balé ele aparece na própria tela, sem cobrir a faixa do aluno).
        if (codigoDaTrava) {
          if (!opcoes?.onErro) toast.error(MENSAGEM_DA_TRAVA[codigoDaTrava]);
          queryClient.invalidateQueries({ queryKey: ['event-seats', eventId] });
          opcoes?.onErro?.(codigoDaTrava);
        } else if (msg.includes('seats_unavailable')) {
          if (!opcoes?.onErro) toast.error('Alguém pegou esses assentos antes de você');
          queryClient.invalidateQueries({ queryKey: ['event-seats', eventId] });
          opcoes?.onErro?.('seats_unavailable');
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
      // Anti-double-payment: novo hold => esquece orderId anterior desse evento.
      clearStoredOrderId(eventId);
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
                        hold_expires_at: next.expiresAt,
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
        // `.then` é o que dispara: sem ele o construtor do supabase não manda
        // nada, e a poltrona ficava presa no servidor enquanto a tela já tinha
        // esquecido a reserva (OS-365; no balé, contava nos 4 do aluno).
        void supabase.rpc('release_seats', {
          _event_id: eventId,
          _hold_token: cur.token,
        }).then(() => undefined);
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
