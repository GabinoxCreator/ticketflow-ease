import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Ticket, X, Minus, Plus } from 'lucide-react';
import type { EventSeatRow } from '@/hooks/useEventSeats';
import type { HoldState } from '@/hooks/useSeatHold';
import { HoldCountdown } from './HoldCountdown';
import { goToSeatCheckout } from '@/lib/seatCheckoutNav';

interface Props {
  seats: EventSeatRow[];
  hold: HoldState | null;
  addons: Record<string, number>;
  eventId: string;
  onRelease: () => void;
  setSeatAddon: (seatId: string, qty: number) => void;
  markProceeding: () => void;
}

const formatPrice = (price: number) =>
  price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function SelectionPanel({
  seats,
  hold,
  addons,
  eventId,
  onRelease,
  setSeatAddon,
  markProceeding,
}: Props) {
  const navigate = useNavigate();

  if (!hold) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5 sticky top-4">
        <h3 className="font-display font-semibold text-lg mb-3">Sua seleção</h3>
        <p className="text-sm text-muted-foreground">
          Clique numa mesa disponível no mapa para reservar.
        </p>
      </div>
    );
  }

  const rows = hold.seatIds
    .map((id) => seats.find((s) => s.id === id))
    .filter((s): s is EventSeatRow => !!s);

  const subtotal = rows.reduce((acc, s) => {
    const base = Number(s.base_price ?? 0);
    const extra = Number(s.extra_price ?? 0);
    const qty = addons[s.id] ?? 0;
    return acc + base + extra * qty;
  }, 0);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 sticky top-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-lg">Sua reserva</h3>
        <HoldCountdown expiresAt={hold.expiresAt} />
      </div>

      <ul className="space-y-3 mb-4 max-h-80 overflow-auto pr-1">
        {rows.map((s) => {
          const base = Number(s.base_price ?? 0);
          const extra = Number(s.extra_price ?? 0);
          const baseCap = Number(s.base_capacity ?? 0);
          const maxCap = Number(s.max_capacity ?? 0);
          const maxAddons = Math.max(0, maxCap - baseCap);
          const qty = addons[s.id] ?? 0;
          const lineTotal = base + extra * qty;
          const totalPeople = baseCap + qty;
          return (
            <li
              key={s.id}
              className="space-y-1.5 text-sm py-1.5 border-b border-border/40 last:border-0"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.label || s.code || 'Mesa'}</p>
                  {s.seat_type_name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {s.seat_type_name}
                      {baseCap > 0 &&
                        ` · ${totalPeople} ${totalPeople === 1 ? 'pessoa' : 'pessoas'}`}
                      {qty > 0 && ` (+${qty} extra${qty > 1 ? 's' : ''})`}
                    </p>
                  )}
                </div>
                <span className="tabular-nums shrink-0">{formatPrice(lineTotal)}</span>
              </div>
              {maxAddons > 0 && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    Pessoas adicionais (+{formatPrice(extra)} cada)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={qty <= 0}
                      onClick={() => setSeatAddon(s.id, qty - 1)}
                      aria-label="Diminuir adicionais"
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="text-sm font-semibold w-5 text-center tabular-nums">{qty}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={qty >= maxAddons}
                      onClick={() => setSeatAddon(s.id, qty + 1)}
                      aria-label="Aumentar adicionais"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex justify-between font-semibold text-base mb-4 pt-2 border-t border-border">
        <span>Subtotal</span>
        <span className="gradient-text">{formatPrice(subtotal)}</span>
      </div>

      <Button
        variant="hero"
        size="lg"
        className="w-full"
        onClick={() => goToSeatCheckout(navigate, markProceeding, eventId)}
      >
        <Ticket className="w-4 h-4 mr-2" />
        Ir para pagamento
      </Button>
      <button
        type="button"
        onClick={onRelease}
        className="w-full mt-2 text-xs text-muted-foreground hover:text-destructive inline-flex items-center justify-center gap-1"
      >
        <X className="w-3 h-3" />
        Cancelar reserva
      </button>
    </div>
  );
}
