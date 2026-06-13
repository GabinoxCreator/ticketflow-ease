import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { SeatMapRenderer } from '@/components/seated/SeatMapRenderer';
import type { EventSeatRow } from '@/hooks/useEventSeats';
import type { VStatus } from '@/components/seated/SeatNode';
import { useEventTables, type EventTableRow } from '@/hooks/useEventTables';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw, X, User, Armchair } from 'lucide-react';

interface Props {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SEAT_COLS =
  'id,event_id,status,held_by_user_id,hold_expires_at,hold_token,' +
  'code,label,x,y,width,height,radius,rotation,shape,color,icon,' +
  'seat_type_name,base_price,extra_price,base_capacity,max_capacity';

export function EventTablesMapModal({ eventId, open, onOpenChange }: Props) {
  const [zoom, setZoom] = useState(1);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setZoom(1);
      setSelectedSeatId(null);
    }
  }, [open]);

  const { data: tables } = useEventTables(eventId);
  const tablesById = useMemo(() => {
    const m = new Map<string, EventTableRow>();
    for (const t of tables ?? []) m.set(t.id, t);
    return m;
  }, [tables]);

  const { data: snapshot, isLoading: snapLoading } = useQuery({
    queryKey: ['event-map-snapshot', eventId],
    enabled: open && !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('map_snapshot')
        .eq('id', eventId)
        .maybeSingle();
      if (error) throw error;
      return (data?.map_snapshot ?? null) as { table_map?: unknown; map_objects?: unknown[] } | null;
    },
  });

  const { data: seats, isLoading: seatsLoading } = useQuery({
    queryKey: ['event-seats-map', eventId],
    enabled: open && !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_seats')
        .select(SEAT_COLS)
        .eq('event_id', eventId);
      if (error) throw error;
      return (data ?? []) as unknown as EventSeatRow[];
    },
  });

  const resolveVisualStatus = (seat: EventSeatRow): VStatus => {
    if (seat.status === 'sold') return 'sold';
    if (seat.status === 'manual') return 'sold';
    if (seat.status === 'blocked') return 'blocked';
    if (seat.status === 'held') {
      if (seat.hold_expires_at && new Date(seat.hold_expires_at).getTime() < Date.now()) {
        return 'available';
      }
      return 'held-other';
    }
    return 'available';
  };

  const selected = selectedSeatId ? tablesById.get(selectedSeatId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Mapa do evento</DialogTitle>
          <DialogDescription>
            Visualização das mesas. Clique em uma mesa para ver o cliente e a quantidade de cadeiras.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 px-6 py-2 border-b border-border bg-card/30">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZoom(1)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground ml-2">{Math.round(zoom * 100)}%</span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <LegendDot color="bg-emerald-500" label="Vendida / Manual" />
            <LegendDot color="bg-amber-500" label="Reservada" />
            <LegendDot color="bg-primary" label="Disponível" />
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {snapLoading || seatsLoading ? (
            <Skeleton className="absolute inset-4" />
          ) : !snapshot ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              Este evento não possui mapa publicado.
            </div>
          ) : (
            <SeatMapRenderer
              snapshot={snapshot as { table_map?: { width?: number; height?: number; background_color?: string | null }; map_objects?: never[] }}
              seats={seats ?? []}
              resolveVisualStatus={resolveVisualStatus}
              onToggleSeat={(id) => setSelectedSeatId(id)}
              zoom={zoom}
              fillHeight
            />
          )}

          {selected && (
            <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm bg-card border border-border rounded-xl shadow-lg p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    <Armchair className="h-4 w-4 text-muted-foreground" />
                    {selected.label ?? 'Mesa'}
                    {selected.code && (
                      <span className="text-xs text-muted-foreground">({selected.code})</span>
                    )}
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedSeatId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1.5 text-sm">
                <Badge variant="outline" className={statusBadge(selected.status)}>
                  {statusLabel(selected.status)}
                </Badge>
                {selected.status === 'sold' && (
                  <>
                    {selected.customer_name && (
                      <div className="flex items-center gap-2 pt-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {selected.customer_name}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Cadeiras: {selected.seats_sold ?? '—'}
                      {selected.max_capacity ? ` de ${selected.max_capacity}` : ''}
                    </div>
                  </>
                )}
                {selected.status === 'manual' && (
                  <>
                    {selected.manual_holder_name && (
                      <div className="flex items-center gap-2 pt-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {selected.manual_holder_name}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Capacidade: {selected.base_capacity ?? '—'}
                      {selected.max_capacity && selected.max_capacity !== selected.base_capacity
                        ? ` / ${selected.max_capacity}` : ''}
                    </div>
                  </>
                )}
                {selected.status !== 'sold' && selected.status !== 'manual' && (
                  <div className="text-xs text-muted-foreground">
                    Capacidade: {selected.base_capacity ?? '—'}
                    {selected.max_capacity && selected.max_capacity !== selected.base_capacity
                      ? ` / ${selected.max_capacity}` : ''}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function statusLabel(s: EventTableRow['status']) {
  switch (s) {
    case 'sold': return 'Vendida';
    case 'held': return 'Reservada';
    case 'manual': return 'Manual';
    case 'blocked': return 'Bloqueada';
    default: return 'Disponível';
  }
}

function statusBadge(s: EventTableRow['status']) {
  switch (s) {
    case 'sold': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'held': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'manual': return 'bg-amber-500/15 text-amber-200 border-amber-500/40';
    case 'blocked': return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30';
    default: return 'bg-primary/15 text-primary border-primary/30';
  }
}
