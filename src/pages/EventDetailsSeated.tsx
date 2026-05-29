import { useCallback, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';
import { useAuth } from '@/contexts/AuthContext';
import { useEventSeats, type EventSeatRow } from '@/hooks/useEventSeats';
import { useSeatHold } from '@/hooks/useSeatHold';
import { SeatMapRenderer } from '@/components/seated/SeatMapRenderer';
import { SelectionPanel } from '@/components/seated/SelectionPanel';
import { SeatDetailModal } from '@/components/seated/SeatDetailModal';
import { goToSeatCheckout } from '@/lib/seatCheckoutNav';
import type { VStatus } from '@/components/seated/SeatNode';

interface Props {
  event: any;
  zoom?: number;
}

const EventDetailsSeated = ({ event, zoom = 1 }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  const [isHolding, setIsHolding] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [modalSeatId, setModalSeatId] = useState<string | null>(null);

  const myHoldSeatIds = useMemo(() => new Set(hold?.seatIds ?? []), [hold]);

  const resolveVisualStatus = useCallback(
    (seat: EventSeatRow): VStatus => {
      // 'manual' = mesa fechada pelo produtor fora do checkout. Tratada como
      // indisponível no mapa público (não clicável, mesma aparência de sold).
      if (seat.status === 'manual') return 'sold';
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
      return 'available';
    },
    [user, myHoldSeatIds]
  );

  const handleToggleSeat = useCallback(
    (seatId: string) => {
      if (hold) return; // já tem reserva ativa, não abre modal
      const seat = (seats ?? []).find((s) => s.id === seatId);
      if (!seat) return;
      if (resolveVisualStatus(seat) !== 'available') return;
      setModalSeatId(seatId);
    },
    [seats, resolveVisualStatus, hold]
  );

  const modalSeat = useMemo(
    () => (seats ?? []).find((s) => s.id === modalSeatId) ?? null,
    [seats, modalSeatId]
  );

  const handleConfirmReserve = useCallback(
    async (seatId: string, qty: number) => {
      if (!user) {
        setAuthOpen(true);
        return;
      }
      setIsHolding(true);
      try {
        const initial = qty > 0 ? { [seatId]: qty } : undefined;
        const result = await holdSelected([seatId], initial);
        if (!result) {
          setModalSeatId(null);
          return;
        }
        setModalSeatId(null);
        goToSeatCheckout(navigate, markProceeding, eventId);
      } finally {
        setIsHolding(false);
      }
    },
    [user, holdSelected, navigate, markProceeding, eventId]
  );

  if (!event.map_snapshot) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-4" />
        <h1 className="font-display font-bold text-2xl mb-2">Mapa ainda não disponível</h1>
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
            <div className="flex-1 min-h-0">
              <SeatMapRenderer
                snapshot={event.map_snapshot}
                seats={seats ?? []}
                resolveVisualStatus={resolveVisualStatus}
                onToggleSeat={handleToggleSeat}
                zoom={zoom}
                fillHeight
              />
            </div>
          )}
          <div className="flex flex-wrap gap-3 px-3 py-2 text-xs text-muted-foreground border-t border-border bg-card/60 shrink-0">

            <Legend color="hsl(var(--seat-available))" label="Disponível" />
            <Legend color="hsl(var(--seat-selected))" label="Sua reserva" />
            <Legend color="hsl(var(--seat-held))" label="Em uso" />
            <Legend color="hsl(var(--seat-sold))" label="Vendido" />
          </div>
        </div>

        <aside className="border-t lg:border-t-0 lg:border-l border-border bg-background overflow-y-auto p-4">
          <SelectionPanel
            seats={seats ?? []}
            hold={hold}
            addons={addons}
            eventId={eventId}
            onRelease={releaseCurrent}
            setSeatAddon={setSeatAddon}
            markProceeding={markProceeding}
          />
        </aside>
      </div>

      <SeatDetailModal
        seat={modalSeat}
        open={!!modalSeatId}
        isProcessing={isHolding}
        onClose={() => !isHolding && setModalSeatId(null)}
        onConfirm={handleConfirmReserve}
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
