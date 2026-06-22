import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEventTables, isEffectivelyAvailable, type EventTableRow } from '@/hooks/useEventTables';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Armchair, Search, CheckCircle2, Circle, Lock, Mail, Phone, User, Loader2, Map as MapIcon } from 'lucide-react';
import { formatInSaoPaulo } from '@/lib/eventTime';
import { toast } from 'sonner';
import { EventTablesMapModal } from './EventTablesMapModal';

async function parseInvokeError(error: unknown): Promise<string> {
  const e = error as { context?: { json?: () => Promise<{ error?: string }> }; message?: string };
  try {
    const payload = await e.context?.json?.();
    if (payload?.error) return payload.error;
  } catch { /* noop */ }
  return e.message ?? 'unknown';
}

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
    case 'manual':
      return { label: 'Manual', cls: 'bg-amber-500/15 text-amber-200 border-amber-500/40' };
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
  const [mapOpen, setMapOpen] = useState(false);

  const stats = useMemo(() => {
    const rows = data ?? [];
    const total = rows.length;
    const sold = rows.filter((r) => r.status === 'sold').length;
    const manual = rows.filter((r) => r.status === 'manual').length;
    // Coerente com o gate do hold_seats: held-expirado conta como disponível.
    const available = rows.filter(isEffectivelyAvailable).length;
    const occupancy = total > 0 ? Math.round(((sold + manual) / total) * 100) : 0;
    return { total, sold, available, manual, occupancy };
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (filter === 'sold') rows = rows.filter((r) => r.status === 'sold');
    else if (filter === 'available') rows = rows.filter(isEffectivelyAvailable);
    else if (filter === 'manual') rows = rows.filter((r) => r.status === 'manual');
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        [r.label, r.code, r.customer_name, r.customer_email, r.manual_holder_name]
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
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total" value={stats.total} icon={Armchair} />
        <StatCard label="Vendidas" value={stats.sold} icon={CheckCircle2} accent="emerald" />
        <StatCard label="Manual" value={stats.manual} icon={Lock} accent="amber" />
        <StatCard label="Disponíveis" value={stats.available} icon={Circle} accent="primary" />
        <StatCard label="Ocupação" value={`${stats.occupancy}%`} icon={Lock} accent="pink" />
      </div>

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
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="available">Disponíveis</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" onClick={() => setMapOpen(true)} className="sm:ml-auto">
          <MapIcon className="h-4 w-4 mr-2" />
          Ver mapa
        </Button>
      </div>

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
              <button key={t.id} onClick={() => setSelected(t)} className="text-left">
                <Card className="p-4 hover:border-primary/50 transition-colors h-full">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="text-sm text-muted-foreground">{t.code ?? '—'}</div>
                      <div className="font-semibold truncate">{t.label ?? 'Mesa'}</div>
                    </div>
                    <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {t.seat_type_name && <div>{t.seat_type_name}</div>}
                    {t.base_capacity != null && (
                      <div>
                        {t.status === 'sold' && t.seats_sold != null
                          ? `${t.seats_sold} de ${t.max_capacity ?? t.base_capacity} cadeiras`
                          : `Cap. ${t.base_capacity}${t.max_capacity && t.max_capacity !== t.base_capacity ? ` / ${t.max_capacity}` : ''}`}
                      </div>
                    )}
                    {t.status === 'sold' && t.customer_name && (
                      <div className="text-foreground truncate flex items-center gap-1 pt-1">
                        <User className="h-3 w-3" /> {t.customer_name}
                      </div>
                    )}
                    {t.status === 'manual' && t.manual_holder_name && (
                      <div className="text-foreground truncate flex items-center gap-1 pt-1">
                        <User className="h-3 w-3" /> {t.manual_holder_name}
                      </div>
                    )}
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <TableDetailModal
        table={selected}
        eventId={eventId}
        onClose={() => setSelected(null)}
      />

      <EventTablesMapModal eventId={eventId} open={mapOpen} onOpenChange={setMapOpen} />
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, accent,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'emerald' | 'primary' | 'pink' | 'amber';
}) {
  const accentCls =
    accent === 'emerald' ? 'text-emerald-400'
    : accent === 'pink' ? 'text-pink-400'
    : accent === 'amber' ? 'text-amber-300'
    : accent === 'primary' ? 'text-primary'
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

function TableDetailModal({
  table, eventId, onClose,
}: {
  table: EventTableRow | null;
  eventId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['event-tables', eventId] });
    qc.invalidateQueries({ queryKey: ['event-seats', eventId] });
  };

  const closeMut = useMutation({
    mutationFn: async (input: { seat_id: string; holder_name?: string; holder_phone?: string; notes?: string }) => {
      const { data, error } = await supabase.functions.invoke('close-table-manual', { body: input });
      if (error) throw new Error(await parseInvokeError(error));
      if (!data?.ok) throw new Error(data?.error ?? 'unknown');
      return data;
    },
    onSuccess: () => {
      toast.success('Mesa fechada manualmente.');
      setCloseOpen(false);
      onClose();
      invalidate();
    },
    onError: (e: Error) => {
      const msg = e.message;
      if (msg === 'seat_unavailable') {
        toast.error('A mesa não está mais disponível. Atualizando…');
        invalidate();
        onClose();
      } else if (msg === 'forbidden') {
        toast.error('Você não tem permissão para essa mesa.');
      } else {
        toast.error('Erro ao fechar a mesa.');
      }
    },
  });

  const reopenMut = useMutation({
    mutationFn: async (seat_id: string) => {
      const { data, error } = await supabase.functions.invoke('reopen-table-manual', { body: { seat_id } });
      if (error) throw new Error(await parseInvokeError(error));
      if (!data?.ok) throw new Error(data?.error ?? 'unknown');
      return data;
    },
    onSuccess: () => {
      toast.success('Mesa reaberta.');
      setReopenOpen(false);
      onClose();
      invalidate();
    },
    onError: (e: Error) => {
      if (e.message === 'not_manual') {
        toast.error('Estado da mesa mudou. Atualizando…');
        invalidate();
        onClose();
      } else {
        toast.error('Erro ao reabrir a mesa.');
      }
    },
  });

  if (!table) return null;
  const meta = statusMeta(table.status);
  const canClose = isEffectivelyAvailable(table);
  const canReopen = table.status === 'manual';

  return (
    <>
      <Dialog open={!!table} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Armchair className="h-5 w-5" />
              {table.label ?? 'Mesa'}{' '}
              {table.code && <span className="text-muted-foreground text-sm">({table.code})</span>}
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
                  <span>Cadeiras compradas</span>
                  <span className="text-foreground">
                    {table.seats_sold ?? '—'}
                    {table.max_capacity ? ` de ${table.max_capacity}` : ''}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
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

            {table.status === 'manual' && (
              <div className="border-t border-border pt-3 space-y-2">
                <div className="font-medium">Reserva manual</div>
                {table.manual_holder_name && (
                  <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{table.manual_holder_name}</div>
                )}
                {table.manual_holder_phone && (
                  <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{table.manual_holder_phone}</div>
                )}
                {table.manual_holder_notes && (
                  <div className="text-muted-foreground">{table.manual_holder_notes}</div>
                )}
                {table.manually_closed_at && (
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>Fechada em</span>
                    <span className="text-foreground">{formatInSaoPaulo(table.manually_closed_at)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-border pt-3">
              {canClose && (
                <Button className="w-full" onClick={() => setCloseOpen(true)}>
                  Fechar manualmente
                </Button>
              )}
              {canReopen && (
                <Button className="w-full" variant="outline" onClick={() => setReopenOpen(true)}>
                  Reabrir mesa
                </Button>
              )}
              {!canClose && !canReopen && (
                <Button disabled className="w-full" variant="outline">
                  Mesa indisponível para fechamento manual
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ManualCloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        loading={closeMut.isPending}
        onConfirm={(payload) => closeMut.mutate({ seat_id: table.id, ...payload })}
      />

      <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir mesa?</AlertDialogTitle>
            <AlertDialogDescription>
              A mesa voltará a ficar disponível para venda no checkout público.
              Os dados da reserva manual serão apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reopenMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); reopenMut.mutate(table.id); }}
              disabled={reopenMut.isPending}
            >
              {reopenMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reabrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ManualCloseDialog({
  open, onOpenChange, loading, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading: boolean;
  onConfirm: (payload: { holder_name?: string; holder_phone?: string; notes?: string }) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Reset quando fecha
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setName(''); setPhone(''); setNotes('');
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar mesa manualmente</DialogTitle>
          <DialogDescription>
            A mesa fica indisponível no checkout público. Todos os campos são opcionais.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="holder-name">Nome do responsável</Label>
            <Input id="holder-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label htmlFor="holder-phone">Telefone</Label>
            <Input id="holder-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} />
          </div>
          <div>
            <Label htmlFor="holder-notes">Observações</Label>
            <Textarea id="holder-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm({
              holder_name: name.trim() || undefined,
              holder_phone: phone.trim() || undefined,
              notes: notes.trim() || undefined,
            })}
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Fechar mesa
          </Button>
        </DialogFooter>
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
