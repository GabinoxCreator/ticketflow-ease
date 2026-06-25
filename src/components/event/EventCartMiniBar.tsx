import { Button } from '@/components/ui/button';
import { ChevronUp } from 'lucide-react';

interface Props {
  count: number;
  totalAmount: number;
  visible: boolean;
  onOpen: () => void;
  isBeneficent?: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function EventCartMiniBar({ count, totalAmount, visible, onOpen, isBeneficent }: Props) {
  if (!visible || count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {count} {isBeneficent ? 'convite' : 'ingresso'}{count > 1 ? 's' : ''}
          </p>
          <p className="font-bold text-base gradient-text tabular-nums">
            {fmt(totalAmount)}
          </p>
        </div>
        <Button
          variant="hero"
          size="lg"
          onClick={onOpen}
          className="shrink-0"
        >
          ver
          <ChevronUp className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
