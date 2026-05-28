import { useCallback, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, AlertCircle, Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { AuthModal } from '@/components/auth/AuthModal';
import { useAuth } from '@/contexts/AuthContext';
import { useEventSeats, type EventSeatRow } from '@/hooks/useEventSeats';
import { useSeatHold } from '@/hooks/useSeatHold';
import { SeatMapRenderer } from '@/components/seated/SeatMapRenderer';
import { SelectionPanel } from '@/components/seated/SelectionPanel';
import type { VStatus } from '@/components/seated/SeatNode';

interface Props {
  event: any;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const EventDetailsSeated = ({ event }: Props) => {
  const { user } = useAuth();
  const eventId: string = event.id;

  const { data: seats, isLoading: seatsLoading } = useEventSeats(eventId);
  const { hold, addons, holdSelected, releaseCurrent, setSeatAddon, markProceeding } = useSeatHold(
    eventId,
    user?.id
  );


  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set());
  const [isHolding, setIsHolding] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const myHoldSeatIds = useMemo(
    () => new Set(hold?.seatIds ?? []),
    [hold]
  );

  // Única lógica de tempo: aqui no pai.
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
        // hold expirado: trata como available até realtime/sweeper atualizar
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
      // Não permite des-toggle se já está holdado
      if (hold) return;
      setLocalSelection((prev) => {
        const next = new Set(prev);
        if (next.has(seatId)) next.delete(seatId);
        else next.add(seatId);
        return next;
      });
    },
    [seats, resolveVisualStatus, hold]
  );

  const handleClearSelection = useCallback(() => {
    setLocalSelection(new Set());
  }, []);

  const handleContinue = useCallback(async () => {
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
        setLocalSelection(new Set());
      }
    } finally {
      setIsHolding(false);
    }
  }, [user, localSelection, holdSelected]);

  const handleRelease = useCallback(async () => {
    await releaseCurrent();
  }, [releaseCurrent]);

  // Guard de snapshot patológico: rota já liberou, mas snapshot ainda não chegou
  if (!event.map_snapshot) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-32 max-w-2xl mx-auto px-4 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
          <h1 className="font-display font-bold text-2xl mb-2">
            Mapa ainda não disponível
          </h1>
          <p className="text-muted-foreground">
            O produtor está finalizando o mapa deste evento. Tente novamente em instantes.
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{event.title} - FestPag</title>
        <meta
          name="description"
          content={event.short_description || event.description || ''}
        />
        <link
          rel="canonical"
          href={`https://festpag.com.br/evento/${event.slug ?? event.id}`}
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main className="pt-20 w-full pb-12">
          <section className="w-full max-w-7xl mx-auto px-4 pt-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <h1 className="font-display font-bold text-3xl md:text-4xl mb-2">
                {event.title}
              </h1>
              <p className="text-muted-foreground mb-2">
                {event.city}, {event.state}
              </p>
              <p className="font-semibold text-lg break-words">{event.venue}</p>
              {event.address && (
                <div className="flex items-start gap-2 text-muted-foreground mt-1">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="text-sm break-words">{event.address}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-muted-foreground mt-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{formatDate(event.date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{event.time}</span>
                </div>
              </div>
            </motion.div>

            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 min-w-0">
                {seatsLoading ? (
                  <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-card/40">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <SeatMapRenderer
                    snapshot={event.map_snapshot}
                    seats={seats ?? []}
                    resolveVisualStatus={resolveVisualStatus}
                    onToggleSeat={handleToggleSeat}
                  />
                )}

                {/* Legenda */}
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                  <Legend color="hsl(var(--seat-available))" label="Disponível" />
                  <Legend color="hsl(var(--seat-selected))" label="Selecionado" />
                  <Legend color="hsl(var(--seat-held))" label="Em uso" />
                  <Legend color="hsl(var(--seat-sold))" label="Vendido" />
                </div>
              </div>

              <div>
                <SelectionPanel
                  seats={seats ?? []}
                  localSelection={localSelection}
                  hold={hold}
                  addons={addons}
                  isHolding={isHolding}
                  eventId={eventId}
                  onClearSelection={handleClearSelection}
                  onContinue={handleContinue}
                  onRelease={handleRelease}
                  setSeatAddon={setSeatAddon}
                  markProceeding={markProceeding}
                />
              </div>

            </div>
          </section>
        </main>

        <Footer />

        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={() => setAuthOpen(false)}
        />
      </div>
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
