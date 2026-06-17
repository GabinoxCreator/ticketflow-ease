import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Ticket, Banknote, Percent, Wallet, Map as MapIcon } from 'lucide-react';
import { toast } from 'sonner';
import { formatEventDate } from '@/lib/eventTime';

const statusColors: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  paused: 'bg-amber-100 text-amber-700 border-amber-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  ended: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

const statusLabels: Record<string, string> = {
  published: 'Publicado',
  draft: 'Rascunho',
  paused: 'Pausado',
  cancelled: 'Cancelado',
  ended: 'Encerrado',
};

const formatMoneyBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(n) ? n : 0,
  );

interface EventRow {
  id: string;
  title: string;
  date: string;
  city: string;
  venue: string | null;
  status: string;
  producer_profile_id: string | null;
  table_map_id: string | null;
  producer_profiles: { id: string; brand_name: string } | null;
}

interface LotRow {
  id: string;
  name: string;
  price: number;
  total_quantity: number;
  sold_quantity: number;
  reserved_quantity: number;
}

interface FeeRow {
  id: string;
  payment_method: string;
  fee_percent: number;
  fee_fixed: number;
}

interface OrderKPI {
  total_amount: number;
  service_fee_amount: number | null;
}

const AdminEventoDetalhe: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();

  const eventQ = useQuery({
    queryKey: ['admin-event', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id,title,date,city,venue,status,producer_profile_id,table_map_id,producer_profiles(id,brand_name)')
        .eq('id', eventId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as EventRow | null;
    },
    enabled: !!eventId,
  });

  const lotsQ = useQuery({
    queryKey: ['admin-event-lots', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_lots')
        .select('id,name,price,total_quantity,sold_quantity,reserved_quantity')
        .eq('event_id', eventId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as LotRow[];
    },
    enabled: !!eventId,
  });

  const feesQ = useQuery({
    queryKey: ['admin-event-fees', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_fee_overrides')
        .select('id,payment_method,fee_percent,fee_fixed')
        .eq('event_id', eventId!);
      if (error) throw error;
      return (data || []) as unknown as FeeRow[];
    },
    enabled: !!eventId,
  });

  const ordersQ = useQuery({
    queryKey: ['admin-event-orders-kpi', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('total_amount,service_fee_amount')
        .eq('event_id', eventId!)
        .in('status', ['paid', 'completed']);
      if (error) throw error;
      return (data || []) as OrderKPI[];
    },
    enabled: !!eventId,
  });

  React.useEffect(() => {
    const err = eventQ.error || lotsQ.error || feesQ.error || ordersQ.error;
    if (err) toast.error('Erro ao carregar dados do evento');
  }, [eventQ.error, lotsQ.error, feesQ.error, ordersQ.error]);

  const ev = eventQ.data;

  const ticketsSold = (lotsQ.data || []).reduce((s, l) => s + Number(l.sold_quantity || 0), 0);
  const grossRevenue = (ordersQ.data || []).reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const platformRevenue = (ordersQ.data || []).reduce(
    (s, o) => s + Number(o.service_fee_amount || 0),
    0,
  );
  const producerNet = grossRevenue - platformRevenue;

  if (eventQ.isLoading) {
    return (
      <AdminLayout title="Evento">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!ev) {
    return (
      <AdminLayout title="Evento">
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">Evento não encontrado</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const producer = ev.producer_profiles;

  return (
    <AdminLayout title={ev.title}>
      <div className="space-y-6">
        {/* Breadcrumb + back */}
        <div className="flex items-center gap-3 text-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              producer
                ? navigate(`/admin/produtores/${producer.id}`)
                : navigate('/admin/produtores')
            }
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Link to="/admin/dashboard" className="hover:text-foreground">Admin</Link>
            <span>/</span>
            {producer ? (
              <Link
                to={`/admin/produtores/${producer.id}`}
                className="hover:text-foreground"
              >
                {producer.brand_name}
              </Link>
            ) : (
              <span>—</span>
            )}
            <span>/</span>
            <span className="text-foreground font-medium">{ev.title}</span>
          </div>
        </div>

        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="font-display text-3xl font-semibold text-foreground">
                {ev.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatEventDate(ev.date, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
                {' · '}
                {ev.city}
                {ev.venue ? ` · ${ev.venue}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={statusColors[ev.status] || statusColors.draft}
              >
                {statusLabels[ev.status] || ev.status}
              </Badge>
            </div>
          </div>
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200"
          >
            Visão administrativa — somente leitura nesta etapa
          </Badge>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard
            icon={<Ticket className="h-4 w-4" />}
            label="Ingressos vendidos"
            value={lotsQ.isLoading ? '—' : String(ticketsSold)}
          />
          <KpiCard
            icon={<Banknote className="h-4 w-4" />}
            label="Receita bruta"
            value={ordersQ.isLoading ? '—' : formatMoneyBRL(grossRevenue)}
          />
          <KpiCard
            icon={<Percent className="h-4 w-4" />}
            label="Receita da plataforma"
            value={ordersQ.isLoading ? '—' : formatMoneyBRL(platformRevenue)}
          />
          <KpiCard
            icon={<Wallet className="h-4 w-4" />}
            label="Líquido do produtor"
            value={ordersQ.isLoading ? '—' : formatMoneyBRL(producerNet)}
          />
        </div>

        {/* Lots */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ingressos (lotes)</CardTitle>
          </CardHeader>
          <CardContent>
            {lotsQ.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (lotsQ.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum lote cadastrado
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Vendidos</TableHead>
                    <TableHead>Disponíveis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lotsQ.data || []).map((lot) => {
                    const avail =
                      Number(lot.total_quantity || 0) -
                      Number(lot.sold_quantity || 0) -
                      Number(lot.reserved_quantity || 0);
                    return (
                      <TableRow key={lot.id}>
                        <TableCell className="font-medium">{lot.name}</TableCell>
                        <TableCell>{formatMoneyBRL(Number(lot.price))}</TableCell>
                        <TableCell>{lot.sold_quantity}</TableCell>
                        <TableCell>
                          {avail <= 0 ? (
                            <Badge
                              variant="outline"
                              className="bg-red-50 text-red-700 border-red-200"
                            >
                              Esgotado
                            </Badge>
                          ) : (
                            avail
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Fees */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Taxas do evento</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" disabled>
                    Editar taxa
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Em breve (passo 2)</TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent>
            {feesQ.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (feesQ.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem taxa configurada — usando 10% padrão (todos os métodos)
              </p>
            ) : (
              <ul className="space-y-2">
                {(feesQ.data || []).map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between text-sm border border-border rounded-md px-3 py-2"
                  >
                    <span className="font-medium">{f.payment_method}</span>
                    <span className="text-muted-foreground">
                      {Number(f.fee_percent)}% + {formatMoneyBRL(Number(f.fee_fixed))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Map */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapIcon className="h-4 w-4" /> Mapa de mesa
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ev.table_map_id ? (
              <div className="space-y-1">
                <p className="text-sm">Este evento usa um mapa de mesas.</p>
                <p className="text-xs text-muted-foreground">
                  Pré-visualização disponível em breve.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Evento sem mapa (venda por lote).
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <Card>
    <CardContent className="p-5 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        {icon}
        <span>{label}</span>
      </div>
      <p className="font-display text-2xl font-semibold text-foreground">{value}</p>
    </CardContent>
  </Card>
);

export default AdminEventoDetalhe;
