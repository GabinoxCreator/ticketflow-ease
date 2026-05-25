import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, DollarSign, Banknote, TrendingUp, ShoppingBag, QrCode, CreditCard, Info, Hand } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { supabase } from '@/integrations/supabase/client';
import { useEventLots } from '@/hooks/useEventLots';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// Estimated MP fees (defaults until real fees are stored per order)
const MP_FEE_PIX_PERCENT = 0.99;
const MP_FEE_CARD_PERCENT = 4.98;

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
    // Cortesias (sale_origin='courtesy') NÃO entram em receita nem em estatísticas financeiras
    const allOrders = allOrdersRaw.filter(o => o.sale_origin !== 'courtesy');
    const doorSales = data?.doorSales || [];

    // Partition: online (null/'online') vs manual
    const onlineOrders = allOrders.filter(o => (o.sale_origin || 'online') === 'online');
    const manualOrders = allOrders.filter(o => o.sale_origin === 'manual');

    // Online sales
    const grossOnline = onlineOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const platformFeeOnline = onlineOrders.reduce((s, o) => s + Number(o.service_fee_amount || 0), 0);

    // Manual sales
    const grossManual = manualOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const platformFeeManual = manualOrders.reduce((s, o) => s + Number(o.service_fee_amount || 0), 0);

    // Combined
    const grossTotal = grossOnline + grossManual;
    const platformFee = platformFeeOnline + platformFeeManual;
    const repasseProdutor = grossTotal - platformFee;

    // Method breakdown for ONLINE orders only
    const byMethodOnline = new Map<string, { qty: number; total: number }>();
    onlineOrders.forEach(o => {
      const key = (o.payment_method || 'desconhecido').toLowerCase();
      const k = key.includes('pix') ? 'pix' : (key.includes('card') || key.includes('cart')) ? 'cartao' : key;
      const cur = byMethodOnline.get(k) || { qty: 0, total: 0 };
      cur.qty += 1; cur.total += Number(o.total_amount);
      byMethodOnline.set(k, cur);
    });

    const pixOnline = byMethodOnline.get('pix') || { qty: 0, total: 0 };
    const cardOnline = byMethodOnline.get('cartao') || { qty: 0, total: 0 };

    // MP fees apply ONLY to online sales
    const pixMpFee = +(pixOnline.total * MP_FEE_PIX_PERCENT / 100).toFixed(2);
    const cardMpFee = +(cardOnline.total * MP_FEE_CARD_PERCENT / 100).toFixed(2);
    const totalMpFee = +(pixMpFee + cardMpFee).toFixed(2);

    const liquidoAposMp = +(grossOnline - totalMpFee).toFixed(2);
    const lucroLiquido = +(platformFee - totalMpFee).toFixed(2);

    // Method breakdown for MANUAL orders
    const byMethodManual = new Map<string, { qty: number; total: number }>();
    manualOrders.forEach(o => {
      const k = (o.manual_payment_method || 'outro').toLowerCase();
      const cur = byMethodManual.get(k) || { qty: 0, total: 0 };
      cur.qty += 1; cur.total += Number(o.total_amount);
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
      grossOnline, grossManual, grossTotal,
      platformFee, platformFeeOnline, platformFeeManual, repasseProdutor,
      pixOnline, cardOnline, pixMpFee, cardMpFee, totalMpFee, liquidoAposMp, lucroLiquido,
      manualCount: manualOrders.length,
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
            <div className="text-3xl font-bold mt-2 break-words">{formatBRL(stats.grossTotal)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Online {formatBRL(stats.grossOnline)} + Manual {formatBRL(stats.grossManual)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Banknote className="w-4 h-4" /> Repasse ao Produtor
            </div>
            <div className="text-3xl font-bold mt-2 break-words text-blue-600">{formatBRL(stats.repasseProdutor)}</div>
            <p className="text-xs text-muted-foreground mt-1">Vendas sem taxa de conveniência</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <TrendingUp className="w-4 h-4" /> Lucro Líquido (Plataforma)
            </div>
            <div className="text-3xl font-bold mt-2 break-words text-emerald-600">{formatBRL(stats.lucroLiquido)}</div>
            <p className="text-xs text-muted-foreground mt-1">Taxa conveniência − taxas MP</p>
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
              <p className="text-2xl font-bold tabular-nums break-words">{formatBRL(stats.grossTotal)}</p>
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
              <p className="text-xs text-muted-foreground">Valor Bruto Manual</p>
              <p className="text-2xl font-bold tabular-nums break-words">{formatBRL(stats.grossManual)}</p>
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

      {/* Resumo Pagamentos (MP fees) — somente vendas online */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            Resumo MP (Pagamentos Online)
            <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
              estimativa
            </span>
          </h3>
          <div>
            <p className="text-xs text-muted-foreground">Total Bruto Online</p>
            <p className="text-2xl font-bold tabular-nums break-words">{formatBRL(stats.grossOnline)}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold"><QrCode className="w-4 h-4 text-emerald-600" /> PIX</div>
              <p className="text-xl font-bold mt-1">{formatBRL(stats.pixOnline.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">Taxa MP: {MP_FEE_PIX_PERCENT}%</p>
              <p className="text-xs text-destructive">− {formatBRL(stats.pixMpFee)}</p>
            </div>
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold"><CreditCard className="w-4 h-4 text-blue-600" /> Cartão</div>
              <p className="text-xl font-bold mt-1">{formatBRL(stats.cardOnline.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">Taxa MP: {MP_FEE_CARD_PERCENT}%</p>
              <p className="text-xs text-destructive">− {formatBRL(stats.cardMpFee)}</p>
            </div>
          </div>
          <div className="border-t pt-3 flex justify-between text-sm">
            <span className="text-muted-foreground">Total Taxas Mercado Pago:</span>
            <span className="text-destructive font-medium">− {formatBRL(stats.totalMpFee)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>Valor Líquido Online (após MP):</span>
            <span className="text-emerald-600">{formatBRL(stats.liquidoAposMp)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Taxa de Conveniência */}
      <Card>
        <CardContent className="p-5 space-y-2 text-sm">
          <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-orange-500" /> Taxa de Conveniência</h3>
          <div className="flex justify-between">
            <div>
              <p className="font-medium">Taxa Bruta Cobrada</p>
              <p className="text-xs text-muted-foreground">Soma da taxa cobrada em cada venda</p>
            </div>
            <p className="font-bold">{formatBRL(stats.platformFee)}</p>
          </div>
          <div className="flex justify-between text-destructive">
            <div>
              <p className="font-medium">Taxa MP Descontada</p>
              <p className="text-xs opacity-70">Total de taxas do Mercado Pago</p>
            </div>
            <p className="font-bold">− {formatBRL(stats.totalMpFee)}</p>
          </div>
          <div className="flex justify-between border-t pt-2 text-emerald-600">
            <div>
              <p className="font-semibold">Lucro Líquido (Plataforma)</p>
              <p className="text-xs opacity-70">Valor final após descontos</p>
            </div>
            <p className="font-bold text-lg">{formatBRL(stats.lucroLiquido)}</p>
          </div>
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
