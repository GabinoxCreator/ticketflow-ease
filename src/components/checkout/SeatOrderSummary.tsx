interface SeatSummary {
  id: string;
  label: string | null;
  code: string | null;
  seat_type_name: string | null;
  base_price: number | null;
  extra_price: number | null;
  base_capacity: number | null;
  max_capacity: number | null;
}

interface Props {
  event: { title: string; venue: string; city: string; state: string };
  seats: SeatSummary[];
  addons: Record<string, number>;
  subtotal: number;
  serviceFee: number;
  totalAmount: number;
}

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function SeatOrderSummary({ event, seats, addons, subtotal, serviceFee, totalAmount }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-base mb-3">Resumo do pedido</h2>
        <ul className="space-y-3">
          {seats.map((s) => {
            const baseCap = Number(s.base_capacity ?? 0);
            const extra = Number(s.extra_price ?? 0);
            const base = Number(s.base_price ?? 0);
            const addonQty = addons[s.id] ?? 0;
            const people = baseCap + addonQty;
            const lineTotal = base + extra * addonQty;
            const label = s.label || s.code || 'Mesa';
            return (
              <li key={s.id} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium">Mesa {label}</span>
                    <span className="text-muted-foreground"> · {people} pessoa{people !== 1 ? 's' : ''}</span>
                  </span>
                  <span className="tabular-nums shrink-0">{fmt(lineTotal)}</span>
                </div>
                {addonQty > 0 && (
                  <div className="text-xs text-muted-foreground pl-1 mt-0.5">
                    + {addonQty} adicional{addonQty > 1 ? 'is' : ''} × {fmt(extra)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 pt-3 border-t border-border space-y-1.5">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{fmt(subtotal)}</span>
          </div>
          {serviceFee > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Taxa de conveniência</span>
              <span className="tabular-nums">{fmt(serviceFee)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-base pt-1.5">
            <span>Total</span>
            <span className="gradient-text tabular-nums">{fmt(totalAmount)}</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        {event.title} · {event.venue} — {event.city}/{event.state}
      </p>
    </div>
  );
}
