import { formatEventDate } from '@/lib/eventTime';

import {
  CalendarDays,
  MapPin,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Copy,
  Ticket,
  TrendingUp,
  Layers,
  Clock,
  Flame,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Event } from '@/hooks/useEvents';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface EventListItemProps {
  event: Event;
  onDelete: (id: string) => void;
  onDuplicate?: (event: Event) => void;
}

const statusStyles: Record<
  Event['status'],
  { label: string; className: string }
> = {
  draft: {
    label: 'Rascunho',
    className: 'bg-amber-500/90 text-white border-amber-400/40 shadow-amber-500/20',
  },
  published: {
    label: 'Publicado',
    className:
      'bg-emerald-500/90 text-white border-emerald-400/40 shadow-emerald-500/30',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-destructive/90 text-white border-destructive/40',
  },
  finished: {
    label: 'Finalizado',
    className: 'bg-muted/80 text-muted-foreground border-border/40',
  },
};

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });

export function EventListItem({ event, onDelete, onDuplicate }: EventListItemProps) {
  const navigate = useNavigate();
  const status = statusStyles[event.status];

  const formattedDate = formatEventDate(event.date, { day: '2-digit', month: 'short', year: 'numeric' });


  const lots = event.event_lots ?? [];
  const sold = lots.reduce((s, l) => s + (l.sold_quantity || 0), 0);
  const capacity = lots.reduce((s, l) => s + (l.total_quantity || 0), 0);
  const revenue = event.paid_revenue ?? 0;
  const occupancy = capacity > 0 ? Math.min(100, (sold / capacity) * 100) : 0;

  return (
    <div
      onClick={() => navigate(`/produtor/eventos/${event.id}`)}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl',
        'border border-primary/10 bg-card/40 backdrop-blur-xl',
        'transition-all duration-300',
        'hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5',
      )}
    >
      {/* Subtle radial glow on hover */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />

      <div className="relative flex flex-col md:flex-row">
        {/* Image */}
        <div className="relative w-full md:w-60 h-44 md:h-auto flex-shrink-0 overflow-hidden">
          {event.image_url ? (
            <img
              src={event.image_url}
              alt={event.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/10 to-accent/30 flex items-center justify-center">
              <CalendarDays className="w-10 h-10 text-primary/60" />
            </div>
          )}
          {/* Bottom gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/0 to-background/0 md:bg-gradient-to-r md:from-background/0 md:via-background/0 md:to-background/40" />

          {/* Status badge */}
          <Badge
            className={cn(
              'absolute top-3 left-3 border backdrop-blur-md shadow-lg font-medium',
              status.className,
            )}
          >
            {status.label}
          </Badge>

          {/* Hot badge */}
          {event.is_hot && (
            <Badge className="absolute top-3 right-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white border-orange-400/40 shadow-lg shadow-orange-500/30 backdrop-blur-md gap-1">
              <Flame className="w-3 h-3" />
              Em Alta
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col gap-3 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg md:text-xl truncate text-foreground">
                {event.title}
              </h3>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1.5">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span>{formattedDate}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>{event.time.slice(0, 5)}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="truncate">
                    {event.venue}, {event.city}
                  </span>
                </div>
              </div>
            </div>

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 h-8 w-8 hover:bg-primary/10"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {onDuplicate && (
                  <DropdownMenuItem onClick={() => onDuplicate(event)}>
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicar
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(event.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mini stats */}
          {capacity > 0 && (
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
                <Ticket className="w-3 h-3" />
                <span>
                  {sold}/{capacity} vendidos
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <TrendingUp className="w-3 h-3" />
                <span>{formatBRL(revenue)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent-foreground">
                <Layers className="w-3 h-3" />
                <span>
                  {lots.length} {lots.length === 1 ? 'lote' : 'lotes'}
                </span>
              </div>
            </div>
          )}

          {/* Occupancy bar (only when there is capacity) */}
          {capacity > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Ocupação</span>
                <span className="font-semibold text-foreground">
                  {occupancy.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                  style={{ width: `${occupancy}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
            <span className="text-[11px] text-muted-foreground">
              Criado em {new Date(event.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            </span>

            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/evento/${event.slug ?? event.id}`)}
                className="h-8 text-xs hover:bg-primary/10"
              >
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                Ver
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/produtor/editar-evento/${event.id}`)}
                className="h-8 text-xs border-primary/30 hover:bg-primary/10 hover:border-primary/50"
              >
                <Edit className="w-3.5 h-3.5 mr-1.5" />
                Editar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
