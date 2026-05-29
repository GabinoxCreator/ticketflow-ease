import { useMemo, useState } from 'react';
import { useEventTables, type EventTableRow } from '@/hooks/useEventTables';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Armchair, Search, CheckCircle2, Circle, Lock, Mail, Phone, User } from 'lucide-react';
import { formatInSaoPaulo } from '@/lib/eventTime';

type FilterKey = 'all' | 'sold' | 'available' | 'manual';

interface Props {
  eventId: string;
}

function formatCurrency(v: number | null) {
  if (v == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function statusMeta(s: EventTableRow['status']) {
  switch (s) {
    case 'sold':
      return { label: 'Vendida', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
    case 'held':
      return { label: 'Reservada', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    case 'blocked':
      return { label: 'Bloqueada', cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' };
    default:
      return { label: 'Disponível', cls: 'bg-primary/15 text-primary border-primary/30' };
  }
}

export function EventTablesTab({ eventId }: Props) {
  const { data, isLoading } = useEventTables(eventId);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EventTableRow | null>(null);

  const stats = useMemo(() => {
    const rows = data ?? [];
    const total = rows.length;
    const sold = rows.filter((r) => r.status === 'sold').length;
    const available = rows.filter((r) => r.status === 'available').length;
    // Fase 3: status 'manual' ainda não existe — contar como 0 por ora.
    const manual = 0;
    const occupancy = total > 0 ? Math.round(((sold + manual) / total) * 100) : 0;
    return { total, sold, available, manual, occupancy };
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (filter === 'sold') rows = rows.filter((r) => r.status === 'sold');
    else if (filter === 'available') rows = rows.filter((r) => r.status === 'available');
    else if (filter === 'manual') rows = []; // sem status 'manual' ainda
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        [r.label, r.code, r.customer_name, r.customer_email]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      );
    }
    return rows.slice().sort((a, b) => (a.label ?? a.code ?? '').localeCompare(b.label ?? b.code ?? ''));
  }, [data, filter, search]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} icon={Armchair} />
        <StatCard label="Vendidas" value={stats.sold} icon={CheckCircle2} accent="emerald" />
        <StatCard label="Disponíveis" value={stats.available} icon={Circle} accent="primary" />
        <StatCard label="Ocupação" value={`${stats.occupancy}%`} icon={Lock} accent="pink" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por mesa, cliente ou e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="sold">Vendidas</TabsTrigger>
            <TabsTrigger value="available">Disponíveis</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          {(data ?? []).length === 0
            ? 'Nenhuma mesa configurada para este evento.'
            : 'Nenhuma mesa encontrada com esses filtros.'}
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((t) => {
            const meta = statusMeta(t.status);
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="text-left"
              >
                <Card className="p-4 hover:border-primary/50 transition-colors h-full">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-sm text-muted-foreground">{t.code ?? '—'}</div>
                      <div className="font-semibold">{t.label ?? 'Mesa'}</div>
                    </div>
                    <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {t.seat_type_name && <div>{t.seat_type_name}</div>}
                    {t.base_capacity != null && (
                      <div>
                        Cap. {t.base_capacity}
                        {t.max_capacity && t.max_capacity !== t.base_capacity ? ` / ${t.max_capacity}` : ''}
                      </div>
                    )}
                    {t.status === 'sold' && t.customer_name && (
                      <div className="text-foreground truncate flex items-center gap-1 pt-1">
                        <User className="h-3 w-3" /> {t.customer_name}
                      </div>
                    )}
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <TableDetailModal table={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'emerald' | 'primary' | 'pink';
}) {
  const accentCls =
    accent === 'emerald'
      ? 'text-emerald-400'
      : accent === 'pink'
        ? 'text-pink-400'
        : accent === 'primary'
          ? 'text-primary'
          : 'text-muted-foreground';
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
        </div>
        <Icon className={`h-6 w-6 ${accentCls}`} />
      </div>
    </Card>
  );
}

function TableDetailModal({ table, onClose }: { table: EventTableRow | null; onClose: () => void }) {
  if (!table) return null;
  const meta = statusMeta(table.status);
  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Armchair className="h-5 w-5" />
            {table.label ?? 'Mesa'} {table.code ? <span className="text-muted-foreground text-sm">({table.code})</span> : null}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
              {table.seat_type_name && <span className="text-xs text-muted-foreground">{table.seat_type_name}</span>}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Capacidade base" value={table.base_capacity?.toString() ?? '—'} />
            <Info label="Capacidade máx." value={table.max_capacity?.toString() ?? '—'} />
            <Info label="Preço base" value={formatCurrency(table.base_price)} />
            <Info label="Preço extra" value={formatCurrency(table.extra_price)} />
          </div>

          {table.status === 'sold' && (
            <div className="border-t border-border pt-3 space-y-2">
              <div className="font-medium">Cliente</div>
              {table.customer_name && (
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{table.customer_name}</div>
              )}
              {table.customer_email && (
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{table.customer_email}</div>
              )}
              {table.customer_phone && (
                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{table.customer_phone}</div>
              )}
              <div className="flex justify-between pt-2 text-xs text-muted-foreground">
                <span>Total pago</span>
                <span className="text-foreground">{formatCurrency(table.order_total)}</span>
              </div>
              {table.order_paid_at && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Pago em</span>
                  <span className="text-foreground">{formatInSaoPaulo(table.order_paid_at)}</span>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-border pt-3">
            <Button disabled className="w-full" variant="outline" title="Disponível na Fase 3">
              Fechar manualmente (em breve)
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Disponível assim que a operação manual for liberada.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
