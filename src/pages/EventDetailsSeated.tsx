import { useCallback, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { AlertCircle, Loader2 } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';
import { useAuth } from '@/contexts/AuthContext';
import { useEventSeats, type EventSeatRow } from '@/hooks/useEventSeats';
import { useSeatHold } from '@/hooks/useSeatHold';
import { SeatMapRenderer } from '@/components/seated/SeatMapRenderer';
import { SelectionPanel } from '@/components/seated/SelectionPanel';
import { SeatDetailModal } from '@/components/seated/SeatDetailModal';
import type { VStatus } from '@/components/seated/SeatNode';

interface Props {
  event: any;
  zoom?: number;
}

const EventDetailsSeated = ({ event, zoom = 1 }: Props) => {
  const { user } = useAuth();
  const eventId: string = event.id;

  const { data: seats, isLoading: seatsLoading } = useEventSeats(eventId);
  const {
    hold,
    addons,
    holdSelected,
    releaseCurrent,
    setSeatAddon,
    markProceeding,
  } = useSeatHold(eventId, user?.id);

  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set());
  const [pendingAddons, setPendingAddons] = useState<Record<string, number>>({});
  const [isHolding, setIsHolding] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [modalSeatId, setModalSeatId] = useState<string | null>(null);

  const myHoldSeatIds = useMemo(() => new Set(hold?.seatIds ?? []), [hold]);

  const resolveVisualStatus = useCallback(
    (seat: EventSeatRow): VStatus => {
      if (seat.status === 'sold') return 'sold';
      if (seat.status === 'blocked') return 'blocked';
      if (seat.status === 'held') {
        const stillValid =
          seat.hold_expires_at && new Date(seat.hold_expires_at).getTime() > Date.now();
        if (stillValid) {
          if (user && seat.held_by_user_id === user.id && myHoldSeatIds.has(seat.id)) {
            return 'selected-mine';
          }
          return 'held-other';
        }
      }
      return localSelection.has(seat.id) ? 'selected-mine' : 'available';
    },
    [user, myHoldSeatIds, localSelection]
  );

  const handleToggleSeat = useCallback(
    (seatId: string) => {
      const seat = (seats ?? []).find((s) => s.id === seatId);
      if (!seat) return;
      const v = resolveVisualStatus(seat);
      if (v !== 'available' && v !== 'selected-mine') return;
      if (hold) return; // Não permite mexer após holdar
      setModalSeatId(seatId);
    },
    [seats, resolveVisualStatus, hold]
  );

  const modalSeat = useMemo(
    () => (seats ?? []).find((s) => s.id === modalSeatId) ?? null,
    [seats, modalSeatId]
  );

  const handleConfirmSeat = useCallback((seatId: string, qty: number) => {
    setLocalSelection((prev) => {
      const next = new Set(prev);
      next.add(seatId);
      return next;
    });
    setPendingAddons((prev) => ({ ...prev, [seatId]: qty }));
    setModalSeatId(null);
  }, []);

  const handleRemoveSeat = useCallback((seatId: string) => {
    setLocalSelection((prev) => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
    setPendingAddons((prev) => {
      const { [seatId]: _, ...rest } = prev;
      return rest;
    });
    setModalSeatId(null);
  }, []);

  const handleClearSelection = useCallback(() => {
    setLocalSelection(new Set());
    setPendingAddons({});
  }, []);

  const doHold = useCallback(async () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (localSelection.size === 0) return;
    setIsHolding(true);
    try {
      const ids = Array.from(localSelection);
      const result = await holdSelected(ids);
      if (result) {
        // Propaga addons coletados no modal para o hook (persiste em sessionStorage)
        for (const id of ids) {
          const qty = pendingAddons[id] ?? 0;
          if (qty > 0) setSeatAddon(id, qty);
        }
        setLocalSelection(new Set());
      }
    } finally {
      setIsHolding(false);
    }
  }, [user, localSelection, holdSelected, pendingAddons, setSeatAddon]);

  const handleConfirmAndContinue = useCallback(
    async (seatId: string, qty: number) => {
      handleConfirmSeat(seatId, qty);
      // dispara hold logo após state update
      setTimeout(() => {
        doHold();
      }, 0);
    },
    [handleConfirmSeat, doHold]
  );

  const handleRelease = useCallback(async () => {
    await releaseCurrent();
  }, [releaseCurrent]);

  if (!event.map_snapshot) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-4" />
        <h1 className="font-display font-bold text-2xl mb-2">
          Mapa ainda não disponível
        </h1>
        <p className="text-muted-foreground">
          O produtor está finalizando o mapa deste evento. Tente novamente em instantes.
        </p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{event.title} - Mapa de Mesas - FestPag</title>
      </Helmet>

      <div className="grid lg:grid-cols-[1fr_360px] gap-0 h-full">
        <div className="min-w-0 h-full flex flex-col">
          {seatsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <SeatMapRenderer
              snapshot={event.map_snapshot}
              seats={seats ?? []}
              resolveVisualStatus={resolveVisualStatus}
              onToggleSeat={handleToggleSeat}
              zoom={zoom}
              fillHeight
            />
          )}
          <div className="flex flex-wrap gap-3 px-3 py-2 text-xs text-muted-foreground border-t border-border bg-card/60">
            <Legend color="hsl(var(--seat-available))" label="Disponível" />
            <Legend color="hsl(var(--seat-selected))" label="Selecionado" />
            <Legend color="hsl(var(--seat-held))" label="Em uso" />
            <Legend color="hsl(var(--seat-sold))" label="Vendido" />
          </div>
        </div>

        <aside className="border-t lg:border-t-0 lg:border-l border-border bg-background overflow-y-auto p-4">
          <SelectionPanel
            seats={seats ?? []}
            localSelection={localSelection}
            pendingAddons={pendingAddons}
            hold={hold}
            addons={addons}
            isHolding={isHolding}
            eventId={eventId}
            onClearSelection={handleClearSelection}
            onContinue={doHold}
            onRelease={handleRelease}
            setSeatAddon={setSeatAddon}
            markProceeding={markProceeding}
            onEditSeat={(id) => setModalSeatId(id)}
          />
        </aside>
      </div>

      <SeatDetailModal
        seat={modalSeat}
        open={!!modalSeatId}
        initialAddons={modalSeatId ? pendingAddons[modalSeatId] ?? 0 : 0}
        alreadySelected={!!modalSeatId && localSelection.has(modalSeatId)}
        onClose={() => setModalSeatId(null)}
        onConfirm={handleConfirmSeat}
        onConfirmAndContinue={handleConfirmAndContinue}
        onRemove={handleRemoveSeat}
      />

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => setAuthOpen(false)}
      />
    </>
  );
};

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 rounded-sm border border-border"
        style={{ backgroundColor: color }}
      />
      {label}
    </div>
  );
}

export default EventDetailsSeated;
