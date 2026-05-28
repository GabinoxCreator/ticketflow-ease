import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { EventSeatRow } from '@/hooks/useEventSeats';

interface Props {
  seat: EventSeatRow | null;
  open: boolean;
  initialAddons: number;
  alreadySelected: boolean;
  onClose: () => void;
  onConfirm: (seatId: string, addons: number) => void;
  onConfirmAndContinue: (seatId: string, addons: number) => void;
  onRemove: (seatId: string) => void;
}

const formatPrice = (price: number) =>
  price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function SeatDetailModal({
  seat,
  open,
  initialAddons,
  alreadySelected,
  onClose,
  onConfirm,
  onConfirmAndContinue,
  onRemove,
}: Props) {
  const [addons, setAddons] = useState(initialAddons);

  useEffect(() => {
    if (open) setAddons(initialAddons);
  }, [open, initialAddons]);

  if (!seat) return null;

  const baseCap = Number(seat.base_capacity ?? 0);
  const maxCap = Number(seat.max_capacity ?? baseCap);
  const maxAddons = Math.max(0, maxCap - baseCap);
  const base = Number(seat.base_price ?? 0);
  const extra = Number(seat.extra_price ?? 0);
  const total = base + extra * addons;

  const label = seat.label || seat.code || 'Mesa';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {label}
          </DialogTitle>
          <DialogDescription>
            {seat.seat_type_name || 'Mesa'}
            {baseCap > 0 && ` · Inclui ${baseCap} ${baseCap === 1 ? 'pessoa' : 'pessoas'}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {maxAddons > 0 && (
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Pessoas adicionais</p>
                  <p className="text-xs text-muted-foreground">
                    +{formatPrice(extra)} por pessoa · até {maxAddons}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    disabled={addons <= 0}
                    onClick={() => setAddons((v) => Math.max(0, v - 1))}
                    aria-label="Diminuir"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-6 text-center font-semibold tabular-nums">{addons}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    disabled={addons >= maxAddons}
                    onClick={() => setAddons((v) => Math.min(maxAddons, v + 1))}
                    aria-label="Aumentar"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>
                Mesa {baseCap > 0 ? `(${baseCap} ${baseCap === 1 ? 'pessoa' : 'pessoas'})` : ''}
              </span>
              <span className="tabular-nums">{formatPrice(base)}</span>
            </div>
            {addons > 0 && (
              <div className="flex justify-between">
                <span>+{addons} pessoa{addons > 1 ? 's' : ''} extra</span>
                <span className="tabular-nums">{formatPrice(extra * addons)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold pt-2 border-t border-border/60 text-base">
              <span>Total</span>
              <span className="tabular-nums gradient-text">{formatPrice(total)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Taxa de conveniência calculada no checkout.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="hero"
            size="lg"
            className="w-full"
            onClick={() => onConfirmAndContinue(seat.id, addons)}
          >
            Reservar {label}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onConfirm(seat.id, addons)}
            >
              {alreadySelected ? 'Atualizar' : 'Adicionar à seleção'}
            </Button>
            {alreadySelected && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(seat.id)}
                aria-label="Remover"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
