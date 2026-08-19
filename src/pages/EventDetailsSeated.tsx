import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  /**
   * Link direto para uma unidade: `?unidade=C007`.
   *
   * É o link que o produtor manda para o dono do camarote — ele abre o mapa já
   * com a unidade combinada aberta, mostrando número, piso, quantos ingressos
   * por dia e o valor fechado. Sem isso o comprador cairia num mapa de 100
   * unidades e teria que caçar a dele.
   *
   * Abre UMA vez só: se a pessoa fechar o modal para olhar o mapa, não fica
   * reabrindo na cara dela a cada render.
   */
  const [searchParams] = useSearchParams();
  const unidadeDoLink = searchParams.get('unidade');
  const jaAbriuDoLink = useRef(false);

  /**
   * Link de PACOTE: `?unidades=C007,C008,C009`.
   *
   * A negociação de camarote costuma fechar mais de um. Mandar um link por
   * unidade é o caminho mais curto para o comprador pagar o primeiro, esquecer
   * o segundo, e o produtor descobrir na véspera. Com o pacote ele confere tudo
   * numa tela e paga de uma vez.
   */
  const codigosDoPacote = useMemo(() => {
    const bruto = searchParams.get('unidades');
    if (!bruto) return [] as string[];
    return bruto.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  }, [searchParams]);

  const unidadesDoPacote = useMemo(() => {
    if (!codigosDoPacote.length || !seats?.length) return [] as typeof seats;
    return seats.filter((s) => codigosDoPacote.includes((s.code ?? '').toLowerCase()));
  }, [codigosDoPacote, seats]);

  /** Só dá para reservar o pacote inteiro se TODAS ainda estiverem livres. */
  const pacoteDisponivel = unidadesDoPacote.length > 0
    && unidadesDoPacote.every((s) => s.status === 'available' || s.status === 'held');

  const totalDoPacote = useMemo(
    () => unidadesDoPacote.reduce((soma, s) => soma + Number(s.base_price ?? 0), 0),
    [unidadesDoPacote],
  );

  useEffect(() => {
    // Link de pacote tem tela própria — não abre o modal de uma unidade.
    if (codigosDoPacote.length > 0) return;
    if (jaAbriuDoLink.current || !unidadeDoLink || !seats?.length) return;
    const alvo = seats.find(
      (s) => (s.code ?? '').toLowerCase() === unidadeDoLink.toLowerCase(),
    );
    if (!alvo) return;
    jaAbriuDoLink.current = true;
    // Só abre se ainda dá para comprar. Unidade já vendida abriria um modal
    // sem saída — melhor deixar o mapa falar por si.
    if (alvo.status === 'available' || alvo.status === 'held') {
      setModalSeatId(alvo.id);
    }
  }, [unidadeDoLink, seats, codigosDoPacote]);

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
          // "Meu assento" vem do estado local do hold (myHoldSeatIds) — o
          // held_by_user_id saiu do select público (PII).
          if (myHoldSeatIds.has(seat.id)) {
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

  const reservarPacote = useCallback(async () => {
    if (!user) { setAuthOpen(true); return; }
    if (!pacoteDisponivel) return;
    setIsHolding(true);
    try {
      const ids = unidadesDoPacote.map((s) => s.id);
      // Cada unidade entra com a quantidade de ingressos que o produtor fechou.
      const iniciais: Record<string, number> = {};
      for (const s of unidadesDoPacote) {
        const base = Number(s.base_capacity ?? 0);
        if (base > 0) iniciais[s.id] = base;
      }
      const result = await holdSelected(ids, iniciais);
      if (!result) return;
      goToSeatCheckout(navigate, markProceeding, eventId);
    } finally {
      setIsHolding(false);
    }
  }, [user, pacoteDisponivel, unidadesDoPacote, holdSelected, navigate, markProceeding, eventId]);

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

      {/* Link de pacote: o comprador vê o que foi combinado e paga tudo de uma
          vez. Fica ACIMA do mapa porque é a razão de ele ter aberto a página —
          o mapa é conferência, não busca. */}
      {unidadesDoPacote.length > 0 && (
        <div className="border-b border-border bg-card/80 backdrop-blur px-4 py-3">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="min-w-0">
              <p className="font-display font-semibold text-base leading-tight">
                {unidadesDoPacote.length === 1
                  ? 'Sua reserva'
                  : `Seu pacote · ${unidadesDoPacote.length} unidades`}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {unidadesDoPacote.map((s) => s.label ?? s.code).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total</p>
                <p className="font-display font-bold text-xl gradient-text tabular-nums">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDoPacote)}
                </p>
              </div>
              <Button
                variant="hero" size="lg"
                onClick={reservarPacote}
                disabled={!pacoteDisponivel || isHolding}
              >
                {isHolding
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reservando…</>
                  : pacoteDisponivel ? 'Reservar e pagar' : 'Indisponível'}
              </Button>
            </div>
          </div>
          {!pacoteDisponivel && unidadesDoPacote.length > 0 && (
            <p className="max-w-3xl mx-auto text-xs text-amber-400 mt-2">
              Alguma das unidades deste link já não está disponível. Fale com quem enviou.
            </p>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] lg:grid-rows-[minmax(0,1fr)] gap-0 h-full min-h-0">
        <div className="min-w-0 min-h-0 h-full flex flex-col">
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

        <aside className="border-t lg:border-t-0 lg:border-l border-border bg-background overflow-y-auto p-4 min-h-0">
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
