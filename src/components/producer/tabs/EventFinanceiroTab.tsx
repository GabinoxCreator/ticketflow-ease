import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, DollarSign, Banknote, Ticket, ShoppingBag, QrCode, CreditCard, Info, Hand } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { supabase } from '@/integrations/supabase/client';
import { useEventLots } from '@/hooks/useEventLots';
import { computeProducerFinance, isPaidStatus, orderTicketNet, saleOrigin } from '@/lib/producerFinance';

const formatBRL = (v: number) => {
  const [intPart, fracPart] = v.toFixed(2).split('.');
  const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$\u00A0${intWithDots},${fracPart}`;
};

const METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  transferencia: 'Transferência',
  outro: 'Outro',
};

interface Props {
  eventId: string;
}

interface OrderRow {
  id: string;
  total_amount: number;
  service_fee_amount: number;
  payment_method: string | null;
  status: string;
  sale_origin: string | null;
  manual_payment_method: string | null;
}

interface DoorSaleRow {
  id: string;
  quantity: number;
  total_amount: number;
  payment_method: string;
  operator_id: string | null;
}

export function EventFinanceiroTab({ eventId }: Props) {
  const { lots } = useEventLots(eventId);

  const { data, isLoading } = useQuery({
    queryKey: ['event-financeiro', eventId],
    queryFn: async () => {
      const [ordersRes, doorRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, total_amount, service_fee_amount, payment_method, status, sale_origin, manual_payment_method')
          .eq('event_id', eventId)
          .in('status', ['paid', 'completed']),
        supabase
          .from('door_sales')
          .select('id, quantity, total_amount, payment_method, operator_id, created_at')
          .eq('event_id', eventId),
      ]);
      return {
        orders: (ordersRes.data || []) as OrderRow[],
        doorSales: (doorRes.data || []) as DoorSaleRow[],
      };
    },
    enabled: !!eventId,
  });

  // Resolve operator names for door sales (collaborator IDs)
  const operatorIds = useMemo(
    () => Array.from(new Set((data?.doorSales || []).map(s => s.operator_id).filter(Boolean) as string[])),
    [data]
  );
  const { data: operators } = useQuery({
    queryKey: ['event-financeiro-operators', operatorIds.join(',')],
    queryFn: async () => {
      if (operatorIds.length === 0) return new Map<string, string>();
      const { data } = await supabase
        .from('collaborators')
        .select('id, name')
        .in('id', operatorIds);
      const m = new Map<string, string>();
      (data || []).forEach((c: any) => m.set(c.id, c.name));
      return m;
    },
    enabled: operatorIds.length > 0,
  });

  const stats = useMemo(() => {
    const allOrdersRaw = data?.orders || [];
    const doorSales = data?.doorSales || [];

    // Fonte única (src/lib/producerFinance.ts): valor do ingresso sem taxa,
    // pago, sem cortesia. online / manual / total(=repasse) coerentes com o resto do painel.
    const finance = computeProducerFinance(allOrdersRaw);

    // Partições p/ as quebras por meio de pagamento (pagos, sem cortesia)
    const paidNonCourtesy = allOrdersRaw.filter(o => isPaidStatus(o.status) && saleOrigin(o) !== 'courtesy');
    const onlineOrders = paidNonCourtesy.filter(o => saleOrigin(o) === 'online');
    const manualOrders = paidNonCourtesy.filter(o => saleOrigin(o) === 'manual');

    // Method breakdown for ONLINE orders — valor do ingresso (sem taxa)
    const byMethodOnline = new Map<string, { qty: number; total: number }>();
    onlineOrders.forEach(o => {
      const key = (o.payment_method || 'desconhecido').toLowerCase();
      const k = key.includes('pix') ? 'pix' : (key.includes('card') || key.includes('cart')) ? 'cartao' : key;
      const cur = byMethodOnline.get(k) || { qty: 0, total: 0 };
      cur.qty += 1; cur.total += orderTicketNet(o);
      byMethodOnline.set(k, cur);
    });

    const pixOnline = byMethodOnline.get('pix') || { qty: 0, total: 0 };
    const cardOnline = byMethodOnline.get('cartao') || { qty: 0, total: 0 };

    // Method breakdown for MANUAL orders — valor do ingresso (sem taxa)
    const byMethodManual = new Map<string, { qty: number; total: number }>();
    manualOrders.forEach(o => {
      const k = (o.manual_payment_method || 'outro').toLowerCase();
      const cur = byMethodManual.get(k) || { qty: 0, total: 0 };
      cur.qty += 1; cur.total += orderTicketNet(o);
      byMethodManual.set(k, cur);
    });

    // Tickets sold (online)
    const ticketsSold = (lots || []).reduce((s, l) => s + Number(l.sold_quantity || 0), 0);
    const capacity = (lots || []).reduce((s, l) => s + Number(l.total_quantity || 0), 0);

    // Door sales
    const doorTotal = doorSales.reduce((s, d) => s + Number(d.total_amount), 0);
    const doorTickets = doorSales.reduce((s, d) => s + Number(d.quantity), 0);
    const doorByMethod = new Map<string, { qty: number; total: number; sales: number }>();
    const doorByOperator = new Map<string, { qty: number; total: number; sales: number }>();
    doorSales.forEach(d => {
      const m = doorByMethod.get(d.payment_method) || { qty: 0, total: 0, sales: 0 };
      m.qty += Number(d.quantity); m.total += Number(d.total_amount); m.sales += 1;
      doorByMethod.set(d.payment_method, m);

      const opKey = d.operator_id || 'unknown';
      const op = doorByOperator.get(opKey) || { qty: 0, total: 0, sales: 0 };
      op.qty += Number(d.quantity); op.total += Number(d.total_amount); op.sales += 1;
      doorByOperator.set(opKey, op);
    });

    return {
      online: finance.online, manual: finance.manual, total: finance.total,
      pixOnline, cardOnline,
      manualCount: finance.manualCount,
      byMethodManual: Array.from(byMethodManual.entries()),
      ticketsSold, capacity,
      doorTotal, doorTickets,
      doorByMethod: Array.from(doorByMethod.entries()),
      doorByOperator: Array.from(doorByOperator.entries()),
    };
  }, [data, lots]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <DollarSign className="w-4 h-4" /> Vendas Totais
            </div>
            <div className="text-3xl font-bold mt-2 break-words">{formatBRL(stats.total)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Online {formatBRL(stats.online)} + Manual {formatBRL(stats.manual)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Banknote className="w-4 h-4" /> Repasse ao Produtor
            </div>
            <div className="text-3xl font-bold mt-2 break-words text-blue-600">{formatBRL(stats.total)}</div>
            <p className="text-xs text-muted-foreground mt-1">Igual às vendas — a taxa de conveniência é paga pelo comprador</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Ticket className="w-4 h-4" /> Ingressos Vendidos
            </div>
            <div className="text-3xl font-bold mt-2 break-words">{stats.ticketsSold}<span className="text-lg text-muted-foreground">/{stats.capacity}</span></div>
            <p className="text-xs text-muted-foreground mt-1">Total emitido no evento</p>
          </CardContent>
        </Card>
      </div>

      {/* Ingressos */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Ingressos</h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Ingressos Vendidos</p>
              <p className="text-2xl font-bold tabular-nums">{stats.ticketsSold}<span className="text-base text-muted-foreground">/{stats.capacity}</span></p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Valor Arrecadado</p>
              <p className="text-2xl font-bold tabular-nums break-words">{formatBRL(stats.total)}</p>
            </div>
          </div>
          <div className="border-t pt-3 space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <QrCode className="w-3.5 h-3.5 text-emerald-600" />
              <span>PIX online: <strong>{formatBRL(stats.pixOnline.total)}</strong> ({stats.pixOnline.qty} venda{stats.pixOnline.qty !== 1 ? 's' : ''})</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              <span>Cartão online: <strong>{formatBRL(stats.cardOnline.total)}</strong> ({stats.cardOnline.qty} venda{stats.cardOnline.qty !== 1 ? 's' : ''})</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vendas Manuais */}
      <Card className="border-indigo-200">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Hand className="w-4 h-4 text-indigo-600" /> Vendas Manuais
              <HoverCard openDelay={150}>
                <HoverCardTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="O que são vendas manuais">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-80 text-xs">
                  Vendas registradas manualmente pelo produtor. O FestPag não processa
                  esses pagamentos — apenas registra para emitir ingressos e somar na
                  receita. Diferencia das vendas online (com transação no MP) e de
                  vendas na portaria (não entram na receita).
                </HoverCardContent>
              </HoverCard>
            </h3>
            <span className="text-[10px] uppercase tracking-wide bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
              Entra na receita
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total de Vendas Manuais</p>
              <p className="text-2xl font-bold tabular-nums">{stats.manualCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valor Manual (sem taxa)</p>
              <p className="text-2xl font-bold tabular-nums break-words">{formatBRL(stats.manual)}</p>
            </div>
          </div>
          {stats.byMethodManual.length > 0 ? (
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Por Meio de Pagamento</p>
              <div className="space-y-1.5">
                {stats.byMethodManual.map(([method, v]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span>{METHOD_LABELS[method] || method}</span>
                    <span className="tabular-nums">{v.qty}× · <strong>{formatBRL(v.total)}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground border-t pt-3">
              Nenhuma venda manual registrada neste evento.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Vendas na Portaria — conferência */}
      <Card className="border-amber-200">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-amber-600" /> Vendas na Portaria
            </h3>
            <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
              Apenas conferência
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Quantidade vendida na porta</p>
              <p className="text-2xl font-bold tabular-nums">{stats.doorTickets}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valor referência</p>
              <p className="text-2xl font-bold tabular-nums break-words">{formatBRL(stats.doorTotal)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2 flex gap-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
            <span>Estes valores <strong>não</strong> são contabilizados na receita. Servem apenas para controle de quantidade de pessoas e conferência de caixa.</span>
          </p>

          {stats.doorByMethod.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Por Meio de Pagamento</p>
              <div className="space-y-1.5">
                {stats.doorByMethod.map(([method, v]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span>{METHOD_LABELS[method] || method}</span>
                    <span className="tabular-nums">{v.qty}× · <strong>{formatBRL(v.total)}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.doorByOperator.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Por Operador</p>
              <div className="space-y-1.5">
                {stats.doorByOperator.map(([opId, v]) => (
                  <div key={opId} className="flex justify-between text-sm">
                    <span>{operators?.get(opId) || 'Desconhecido'}</span>
                    <span className="tabular-nums">{v.sales} venda(s) · <strong>{formatBRL(v.total)}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
