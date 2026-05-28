import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Ticket, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SummaryItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface Props {
  variant: 'sidebar' | 'bar';
  items: SummaryItem[];
  totalAmount: number;
  totalCount: number;
  hasMesa?: boolean;
  mesaCtaHref?: string;
  onCheckout: () => void;
  disabled?: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function EventOrderSummary({
  variant,
  items,
  totalAmount,
  totalCount,
  hasMesa,
  mesaCtaHref,
  onCheckout,
  disabled,
}: Props) {
  const hasItems = totalCount > 0;

  if (variant === 'bar') {
    // Mobile bottom bar — compacto
    if (!hasItems && !hasMesa) return null;
    return (
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          {hasItems ? (
            <>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {totalCount} ingresso{totalCount > 1 ? 's' : ''}
                </p>
                <p className="font-bold text-lg gradient-text">{fmt(totalAmount)}</p>
              </div>
              <Button
                variant="hero"
                size="lg"
                onClick={onCheckout}
                disabled={disabled}
                className="shrink-0"
              >
                <Ticket className="w-5 h-5 mr-2" />
                Comprar
              </Button>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Mesas com lugar marcado</p>
                <p className="font-semibold text-sm">Reserve sua mesa</p>
              </div>
              {mesaCtaHref && (
                <Button asChild variant="hero" size="lg" className="shrink-0">
                  <Link to={mesaCtaHref}>
                    Ver Mapa
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Sidebar desktop
  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-lg shadow-primary/5">
      <h3 className="font-display font-semibold text-lg mb-4">Resumo</h3>

      {hasItems ? (
        <>
          <ul className="space-y-2 mb-4">
            {items.map((it) => (
              <li key={it.id} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground tabular-nums">{it.quantity}× </span>
                  {it.name}
                </span>
                <span className="tabular-nums shrink-0">{fmt(it.price * it.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between font-semibold text-base mb-4 pt-3 border-t border-border">
            <span>Total</span>
            <span className="gradient-text">{fmt(totalAmount)}</span>
          </div>
          <Button
            variant="hero"
            size="lg"
            className="w-full"
            onClick={onCheckout}
            disabled={disabled}
          >
            <Ticket className="w-5 h-5 mr-2" />
            Comprar Ingressos
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {hasMesa
              ? 'Selecione seus ingressos ou reserve uma mesa.'
              : 'Selecione seus ingressos.'}
          </p>
          {hasMesa && mesaCtaHref && (
            <Button asChild variant="hero" size="lg" className="w-full">
              <Link to={mesaCtaHref}>
                Reservar Mesa
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          )}
        </>
      )}

      <p className={cn('text-xs text-muted-foreground mt-4 text-center')}>
        Pagamento seguro via PIX ou cartão.
      </p>
    </div>
  );
}
