import { Button } from '@/components/ui/button';
import { Loader2, Ticket, X } from 'lucide-react';
import { toast } from 'sonner';
import type { EventSeatRow } from '@/hooks/useEventSeats';
import type { HoldState } from '@/hooks/useSeatHold';
import { HoldCountdown } from './HoldCountdown';

interface Props {
  seats: EventSeatRow[];
  localSelection: Set<string>;
  hold: HoldState | null;
  isHolding: boolean;
  onClearSelection: () => void;
  onContinue: () => void;
  onRelease: () => void;
  onProceedStub: () => void;
}

const formatPrice = (price: number) =>
  price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function SelectionPanel({
  seats,
  localSelection,
  hold,
  isHolding,
  onClearSelection,
  onContinue,
  onRelease,
  onProceedStub,
}: Props) {
  const heldMode = !!hold;
  const idsForDisplay = heldMode ? hold!.seatIds : Array.from(localSelection);
  const rows = idsForDisplay
    .map((id) => seats.find((s) => s.id === id))
    .filter((s): s is EventSeatRow => !!s);

  const subtotal = rows.reduce((acc, s) => acc + Number(s.base_price ?? 0), 0);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 sticky top-24">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-lg">Sua seleção</h3>
        {hold && <HoldCountdown expiresAt={hold.expiresAt} />}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Clique nos assentos disponíveis no mapa para selecionar.
        </p>
      ) : (
        <ul className="space-y-2 mb-4 max-h-64 overflow-auto pr-1">
          {rows.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border/40 last:border-0"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{s.label || s.code || 'Assento'}</p>
                {s.seat_type_name && (
                  <p className="text-xs text-muted-foreground truncate">{s.seat_type_name}</p>
                )}
              </div>
              <span className="tabular-nums">{formatPrice(Number(s.base_price ?? 0))}</span>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="flex justify-between font-semibold text-base mb-4 pt-2 border-t border-border">
          <span>Subtotal</span>
          <span className="gradient-text">{formatPrice(subtotal)}</span>
        </div>
      )}

      {!heldMode ? (
        <>
          <Button
            variant="hero"
            size="lg"
            className="w-full"
            disabled={localSelection.size === 0 || isHolding}
            onClick={onContinue}
          >
            {isHolding ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Ticket className="w-4 h-4 mr-2" />
            )}
            Continuar ({localSelection.size})
          </Button>
          {localSelection.size > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
            >
              <X className="w-3 h-3" />
              Limpar seleção
            </button>
          )}
          <p className="text-xs text-muted-foreground text-center mt-3">
            Você terá ~10 min para finalizar após reservar.
          </p>
        </>
      ) : (
        <>
          <Button
            variant="hero"
            size="lg"
            className="w-full"
            disabled={!hold}
            onClick={() => {
              // STUB: NÃO chama markProceeding. Pagamento entra na próxima fase.
              onProceedStub();
              toast.info('Checkout do mapa estará disponível em breve');
            }}
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
            Cancelar seleção
          </button>
        </>
      )}
    </div>
  );
}
