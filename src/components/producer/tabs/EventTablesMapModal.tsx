import { useMemo, useState, type ReactNode } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, User, Phone, Armchair } from 'lucide-react';
import { useEventTables, type EventTableRow } from '@/hooks/useEventTables';

interface Props {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Filter = 'all' | 'sold' | 'manual';

export function EventTablesMapModal({ eventId, open, onOpenChange }: Props) {
  const { data: tables, isLoading } = useEventTables(eventId);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const reserved = useMemo(
    () => (tables ?? []).filter((t) => t.status === 'sold' || t.status === 'manual'),
    [tables],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reserved
      .filter((t) => (filter === 'all' ? true : t.status === filter))
      .filter((t) => {
        if (!q) return true;
        const name = (t.customer_name ?? t.manual_holder_name ?? '').toLowerCase();
        const code = (t.code ?? '').toLowerCase();
        const label = (t.label ?? '').toLowerCase();
        return name.includes(q) || code.includes(q) || label.includes(q);
      })
      .sort((a, b) => (a.code ?? a.label ?? '').localeCompare(b.code ?? b.label ?? ''));
  }, [reserved, filter, search]);

  const totalSeats = reserved.reduce(
    (sum, t) => sum + (t.seats_sold ?? t.base_capacity ?? 0),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Mapa de reservas</DialogTitle>
          <DialogDescription>
            Visão ilustrativa das mesas reservadas — cliente e quantidade de cadeiras de cada reserva.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-3 border-b border-border bg-card/30">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou código da mesa…"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              Todas ({reserved.length})
            </FilterChip>
            <FilterChip active={filter === 'sold'} onClick={() => setFilter('sold')}>
              Vendidas ({reserved.filter((t) => t.status === 'sold').length})
            </FilterChip>
            <FilterChip active={filter === 'manual'} onClick={() => setFilter('manual')}>
              Manual ({reserved.filter((t) => t.status === 'manual').length})
            </FilterChip>
          </div>
          <div className="text-xs text-muted-foreground sm:ml-auto whitespace-nowrap">
            {totalSeats} cadeiras ocupadas
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-56 rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
              <Armchair className="h-10 w-10 opacity-50" />
              <div className="font-medium">Nenhuma mesa reservada</div>
              <div className="text-xs">As mesas vendidas ou fechadas manualmente aparecerão aqui.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((t) => (
                <TableCard key={t.id} table={t} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      className="h-8"
    >
      {children}
    </Button>
  );
}

function TableCard({ table }: { table: EventTableRow }) {
  const isManual = table.status === 'manual';
  const holder = table.customer_name ?? table.manual_holder_name ?? 'Sem nome';
  const phone = table.customer_phone ?? table.manual_holder_phone ?? null;
  const seats = table.seats_sold ?? table.base_capacity ?? 0;
  const capacity = table.max_capacity ?? table.base_capacity ?? seats;
  const drawSeats = Math.max(1, Math.min(12, seats || table.base_capacity || 4));

  const accent = isManual
    ? 'border-amber-500/40 bg-amber-500/5'
    : 'border-emerald-500/40 bg-emerald-500/5';
  const tableFill = isManual ? '#f59e0b' : '#10b981';

  return (
    <div className={`rounded-xl border ${accent} p-4 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">
            {table.label ?? 'Mesa'}
            {table.code && (
              <span className="text-xs text-muted-foreground ml-1.5">({table.code})</span>
            )}
          </div>
          {table.seat_type_name && (
            <div className="text-xs text-muted-foreground truncate">{table.seat_type_name}</div>
          )}
        </div>
        <Badge
          variant="outline"
          className={
            isManual
              ? 'bg-amber-500/15 text-amber-200 border-amber-500/40'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          }
        >
          {isManual ? 'Manual' : 'Vendida'}
        </Badge>
      </div>

      <TableIllustration seats={drawSeats} fill={tableFill} />

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{holder}</span>
        </div>
        {phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{phone}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <Armchair className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-foreground font-medium">{seats}</span>
          <span className="text-muted-foreground">de {capacity} cadeiras</span>
        </div>
        {isManual && table.manual_close_reason && (
          <div className="text-xs text-muted-foreground italic line-clamp-2 pt-1">
            “{table.manual_close_reason}”
          </div>
        )}
      </div>
    </div>
  );
}

function TableIllustration({ seats, fill }: { seats: number; fill: string }) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const tableR = 26;
  const chairR = 8;
  const orbit = 48;

  const chairs = Array.from({ length: seats }, (_, i) => {
    const angle = (i / seats) * Math.PI * 2 - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * orbit,
      y: cy + Math.sin(angle) * orbit,
    };
  });

  return (
    <div className="flex items-center justify-center bg-background/40 rounded-lg py-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {chairs.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={chairR}
            fill={fill}
            fillOpacity={0.25}
            stroke={fill}
            strokeWidth={1.5}
          />
        ))}
        <circle
          cx={cx}
          cy={cy}
          r={tableR}
          fill={fill}
          fillOpacity={0.85}
          stroke={fill}
          strokeWidth={2}
        />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          fill="#0b0b0f"
        >
          {seats}
        </text>
      </svg>
    </div>
  );
}
