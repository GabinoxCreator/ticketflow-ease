import { useRef, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Banknote, Loader2, Paperclip, ExternalLink } from 'lucide-react';

type PayoutStatus = 'requested' | 'paid' | string;

interface BankSnapshot {
  pix_key?: string | null;
  bank_name?: string | null;
  agency?: string | null;
  account_number?: string | null;
  account_holder_name?: string | null;
  account_type?: string | null;
  [k: string]: unknown;
}

interface PayoutRow {
  id: string;
  status: PayoutStatus;
  net_amount: number;
  period_start: string; // date YYYY-MM-DD
  paid_at: string | null;
  receipt_url: string | null;
  produtor: string | null;
  evento: string | null;
  bank_account_snapshot: BankSnapshot | null;
}

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatMoneyBRL(n: number | null | undefined) {
  return moneyFmt.format(Number(n ?? 0));
}

function formatDateBR(value: string | null | undefined) {
  if (!value) return '—';
  // YYYY-MM-DD → add T12:00:00 to avoid UTC shift
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function nonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function formatDestino(snap: BankSnapshot | null): string[] {
  if (!snap) return ['—'];
  const lines: string[] = [];
  if (nonEmpty(snap.pix_key)) {
    lines.push(`PIX · ${snap.pix_key}`);
    const second = [snap.bank_name, snap.account_holder_name]
      .filter(nonEmpty)
      .join(' · ');
    if (second) lines.push(second);
  } else {
    if (nonEmpty(snap.bank_name)) lines.push(snap.bank_name);
    const ag = nonEmpty(snap.agency) ? `Ag ${snap.agency}` : null;
    const cc = nonEmpty(snap.account_number) ? `Conta ${snap.account_number}` : null;
    const second = [ag, cc].filter(Boolean).join(' · ');
    if (second) lines.push(second);
    if (nonEmpty(snap.account_holder_name)) lines.push(snap.account_holder_name);
  }
  return lines.length ? lines : ['—'];
}

function mapMarkPaidError(payload: any): string {
  const err = payload?.error;
  if (err === 'invalid_status') return 'Este repasse não está mais como solicitado.';
  if (err === 'payout_not_found') return 'Repasse não encontrado.';
  return 'Não foi possível concluir. Tente novamente.';
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

type TabKey = 'requested' | 'paid' | 'all';

function usePayouts(tab: TabKey) {
  return useQuery({
    queryKey: ['admin-payouts', tab],
    queryFn: async () => {
      const p_status = tab === 'all' ? null : tab;
      const { data, error } = await supabase.rpc('admin_list_payouts', { p_status });
      if (error) throw error;
      return (data ?? []) as PayoutRow[];
    },
    staleTime: 15_000,
  });
}

const AdminRepasses: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('requested');

  const requestedQ = usePayouts('requested');
  const paidQ = usePayouts('paid');
  const allQ = usePayouts('all');

  return (
    <AdminLayout title="Repasses">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Repasses financeiros</h1>
          <p className="text-sm text-muted-foreground">
            Aprove e registre os comprovantes dos repasses solicitados pelos produtores.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="requested" className="gap-2">
              Solicitados
              <Badge variant="secondary">{requestedQ.data?.length ?? 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="paid" className="gap-2">
              Pagos
              <Badge variant="secondary">{paidQ.data?.length ?? 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              Todos
              <Badge variant="secondary">{allQ.data?.length ?? 0}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requested">
            <PayoutsTable query={requestedQ} />
          </TabsContent>
          <TabsContent value="paid">
            <PayoutsTable query={paidQ} />
          </TabsContent>
          <TabsContent value="all">
            <PayoutsTable query={allQ} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

interface QueryShape {
  data: PayoutRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

function PayoutsTable({ query }: { query: QueryShape }) {
  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-destructive">
          Não foi possível carregar os repasses.
        </CardContent>
      </Card>
    );
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Banknote className="h-10 w-10 mb-3 text-orange-500/50" />
          <p>Nenhum repasse neste filtro.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produtor / evento</TableHead>
              <TableHead>Conta de destino</TableHead>
              <TableHead>Solicitado em</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status / ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <PayoutRowView key={r.id} row={r} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PayoutRowView({ row }: { row: PayoutRow }) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const destinoLinhas = formatDestino(row.bank_account_snapshot);

  const markPaid = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('admin_mark_payout_paid', {
        p_payout_id: row.id,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      if (data?.ok) {
        toast.success('Repasse marcado como pago');
        qc.invalidateQueries({ queryKey: ['admin-payouts'] });
        setConfirmOpen(false);
      } else {
        toast.error(mapMarkPaidError(data));
      }
    },
    onError: () => {
      toast.error('Não foi possível concluir. Tente novamente.');
    },
  });

  const attach = useMutation({
    mutationFn: async (file: File) => {
      const path = `${row.id}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const up = await supabase.storage
        .from('payout-proofs')
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (up.error) throw up.error;
      const { data, error } = await supabase.rpc('admin_attach_payout_receipt', {
        p_payout_id: row.id,
        p_path: path,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      if (data?.ok) {
        toast.success('Comprovante anexado');
        qc.invalidateQueries({ queryKey: ['admin-payouts'] });
      } else {
        toast.error('Não foi possível concluir. Tente novamente.');
      }
    },
    onError: () => {
      toast.error('Não foi possível concluir. Tente novamente.');
    },
  });

  async function handleView() {
    if (!row.receipt_url) return;
    const { data, error } = await supabase.storage
      .from('payout-proofs')
      .createSignedUrl(row.receipt_url, 60);
    if (error || !data?.signedUrl) {
      toast.error('Não foi possível abrir o comprovante.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.produtor ?? '—'}</div>
        <div className="text-xs text-muted-foreground">{row.evento ?? '—'}</div>
      </TableCell>
      <TableCell>
        <div className="text-sm leading-snug">
          {destinoLinhas.map((l, i) => (
            <div key={i} className={i === 0 ? 'font-medium' : 'text-muted-foreground text-xs'}>
              {l}
            </div>
          ))}
        </div>
      </TableCell>
      <TableCell className="font-display">{formatDateBR(row.period_start)}</TableCell>
      <TableCell className="text-right font-display font-semibold">
        {formatMoneyBRL(row.net_amount)}
      </TableCell>
      <TableCell>
        {row.status === 'requested' ? (
          <div className="flex flex-col gap-2 items-start">
            <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/40 border">
              Solicitado
            </Badge>
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={markPaid.isPending}
            >
              {markPaid.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Marcar como pago
            </Button>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar pagamento</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm">
                      <div>
                        Valor:{' '}
                        <span className="font-display font-semibold">
                          {formatMoneyBRL(row.net_amount)}
                        </span>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Destino:</div>
                        {destinoLinhas.map((l, i) => (
                          <div key={i}>{l}</div>
                        ))}
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={markPaid.isPending}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={markPaid.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      markPaid.mutate();
                    }}
                  >
                    {markPaid.isPending && (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    )}
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : row.status === 'paid' ? (
          <div className="flex flex-col gap-2 items-start">
            <div className="text-sm">Pago em {formatDateBR(row.paid_at)}</div>
            {row.receipt_url ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500/20 text-green-700 border-green-500/40 border">
                  Comprovante anexado
                </Badge>
                <Button size="sm" variant="outline" onClick={handleView}>
                  <ExternalLink className="h-3 w-3" /> Ver
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Sem comprovante</Badge>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) attach.mutate(f);
                    e.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={attach.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  {attach.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Paperclip className="h-3 w-3" />
                  )}
                  {attach.isPending ? 'Enviando…' : 'Anexar comprovante'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Badge variant="secondary">{row.status}</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

export default AdminRepasses;
