import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Trash2, Ticket } from 'lucide-react';
import type { SummaryItem } from './EventOrderSummary';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SummaryItem[];
  totalAmount: number;
  totalCount: number;
  onCheckout: () => void;
  onIncrement: (lotId: string) => void;
  onDecrement: (lotId: string) => void;
  onRemove: (lotId: string) => void;
  isBeneficent?: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function EventCartSheet({
  open,
  onOpenChange,
  items,
  totalAmount,
  totalCount,
  onCheckout,
  onIncrement,
  onDecrement,
  onRemove,
  isBeneficent,
}: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>
            Sua seleção
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({totalCount} {isBeneficent ? 'convite' : 'ingresso'}{totalCount > 1 ? 's' : ''})
            </span>
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <ul className="space-y-3">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm break-words">{it.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {fmt(it.price)} cada · {fmt(it.price * it.quantity)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => onDecrement(it.id)}
                    aria-label="Diminuir"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">
                    {it.quantity}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => onIncrement(it.id)}
                    aria-label="Aumentar"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(it.id)}
                    aria-label="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-border bg-card/95 backdrop-blur-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-bold text-lg gradient-text tabular-nums">
                {fmt(totalAmount)}
              </p>
            </div>
            <Button
              variant="hero"
              size="lg"
              onClick={onCheckout}
              disabled={totalCount === 0}
              className="shrink-0"
            >
              <Ticket className="w-5 h-5 mr-2" />
              Ir para pagamento
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
