import { Ticket, Armchair, Layers, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EventType = 'ingresso' | 'mesa' | 'hibrido';

interface EventTypeSelectorProps {
  value: EventType;
  onChange: (value: EventType) => void;
  /** Tipo original do evento (usado em edição para detectar mudanças e bloqueios). */
  originalType?: EventType;
  /** Se true, bloqueia mudar de mesa/hibrido -> ingresso (existem assentos vendidos). */
  hasSoldSeats?: boolean;
  disabled?: boolean;
}

const OPTIONS: Array<{
  value: EventType;
  title: string;
  description: string;
  icon: typeof Ticket;
}> = [
  {
    value: 'ingresso',
    title: 'Ingresso',
    description: 'Venda tradicional por lotes (Pista, VIP, etc.)',
    icon: Ticket,
  },
  {
    value: 'mesa',
    title: 'Reservas',
    description: 'Mesas, cadeiras e bistrôs num mapa interativo',
    icon: Armchair,
  },
  {
    value: 'hibrido',
    title: 'Híbrido',
    description: 'Combina lotes de ingresso + mapa de reservas',
    icon: Layers,
  },
];

export function EventTypeSelector({
  value,
  onChange,
  originalType,
  hasSoldSeats = false,
  disabled = false,
}: EventTypeSelectorProps) {
  const changedFromIngresso =
    originalType === 'ingresso' && (value === 'mesa' || value === 'hibrido');
  const changedToIngresso =
    (originalType === 'mesa' || originalType === 'hibrido') && value === 'ingresso';
  const blockedReservaToIngresso = changedToIngresso && hasSoldSeats;
  const showComingSoon = value === 'mesa' || value === 'hibrido';

  const handleSelect = (opt: EventType) => {
    if (disabled) return;
    // Bloqueia mudar de mesa/hibrido -> ingresso quando há vendas
    if (
      (originalType === 'mesa' || originalType === 'hibrido') &&
      opt === 'ingresso' &&
      hasSoldSeats
    ) {
      return;
    }
    onChange(opt);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = value === opt.value;
          const isBlocked =
            (originalType === 'mesa' || originalType === 'hibrido') &&
            opt.value === 'ingresso' &&
            hasSoldSeats;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              disabled={disabled || isBlocked}
              className={cn(
                'group relative text-left p-4 rounded-2xl border transition-all overflow-hidden',
                'bg-card/40 backdrop-blur-xl',
                isActive
                  ? 'border-primary/60 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.6)] ring-1 ring-primary/40'
                  : 'border-border/60 hover:border-primary/40',
                (disabled || isBlocked) && 'opacity-50 cursor-not-allowed hover:border-border/60'
              )}
            >
              {isActive && (
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
              )}
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors',
                    isActive
                      ? 'bg-gradient-to-br from-[hsl(250,85%,60%)]/30 to-[hsl(330,85%,60%)]/30 border-primary/40 text-primary'
                      : 'bg-muted/40 border-border/60 text-muted-foreground group-hover:text-foreground'
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      isActive ? 'text-foreground' : 'text-foreground/90'
                    )}
                  >
                    {opt.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {opt.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {blockedReservaToIngresso && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-xs leading-snug">
            Não é possível voltar para <strong>Ingresso</strong>: este evento já possui
            assentos vendidos no mapa de reservas.
          </p>
        </div>
      )}

      {changedFromIngresso && !blockedReservaToIngresso && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-xs leading-snug">
            Você precisará <strong>configurar o mapa de reservas</strong> antes de publicar
            este evento.
          </p>
        </div>
      )}

      {showComingSoon && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20 text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <p className="text-xs leading-snug">
            <strong className="text-foreground">Configuração em breve.</strong> O editor de mapa
            de reservas (mesas, cadeiras e bistrôs) será liberado em uma próxima atualização.
            Você já pode criar o evento — voltaremos aqui para configurar o mapa.
          </p>
        </div>
      )}
    </div>
  );
}
