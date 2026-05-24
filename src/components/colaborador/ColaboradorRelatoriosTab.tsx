import { Card, CardContent } from '@/components/ui/card';
import { Ticket, DollarSign, ShoppingBag, TrendingUp, Loader2 } from 'lucide-react';
import { useColaboradorDoorSalesReport } from '@/hooks/useColaboradorDoorSales';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
};

interface Props {
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
}

export default function ColaboradorRelatoriosTab({ eventId, collaboratorId, sessionToken, onSessionExpired }: Props) {
  const { data, isLoading } = useColaboradorDoorSalesReport(eventId, collaboratorId, sessionToken, onSessionExpired);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totals = data?.totals || { tickets: 0, revenue: 0, sales: 0, ticketMedio: 0 };

  const KPI = ({ Icon, label, value, color }: any) => (
    <Card className="border-emerald-200">
      <CardContent className="p-4 text-center">
        <Icon className={`w-6 h-6 mx-auto mb-1 ${color}`} />
        <div className="text-2xl font-extrabold text-slate-900 tabular-nums break-words">{value}</div>
        <div className="text-xs text-slate-500 mt-1">{label}</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KPI Icon={Ticket} label="Ingressos" value={totals.tickets} color="text-emerald-600" />
        <KPI Icon={DollarSign} label="Valor Total" value={formatBRL(totals.revenue)} color="text-emerald-600" />
        <KPI Icon={ShoppingBag} label="Vendas" value={totals.sales} color="text-amber-600" />
        <KPI Icon={TrendingUp} label="Ticket Médio" value={formatBRL(totals.ticketMedio)} color="text-blue-600" />
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3">Por Lote</h3>
          {(data?.byLot.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma venda</p>
          ) : (
            <div className="space-y-2">
              {data!.byLot.map(l => (
                <div key={l.lot_id} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                  <span className="font-medium">{l.name}</span>
                  <span className="tabular-nums">{l.qty}× · <strong>{formatBRL(l.revenue)}</strong></span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3">Por Meio de Pagamento</h3>
          {(data?.byMethod.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma venda</p>
          ) : (
            <div className="space-y-2">
              {data!.byMethod.map(m => (
                <div key={m.method} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                  <span className="font-medium">{METHOD_LABELS[m.method] || m.method}</span>
                  <span className="tabular-nums">{m.sales} venda(s) · <strong>{formatBRL(m.revenue)}</strong></span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3">Por Operador</h3>
          {(data?.byOperator.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma venda</p>
          ) : (
            <div className="space-y-2">
              {data!.byOperator.map(o => (
                <div key={o.operator_id} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                  <span className="font-medium">{o.name}</span>
                  <span className="tabular-nums">{o.sales} venda(s) · <strong>{formatBRL(o.revenue)}</strong></span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
