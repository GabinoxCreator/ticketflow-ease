import { Ticket, DollarSign, ShoppingBag, TrendingUp, Loader2 } from 'lucide-react';
import { useColaboradorDoorSalesReport } from '@/hooks/useColaboradorDoorSales';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(v).replace(/\s/g, '\u00A0');

const METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
};

const METHOD_BADGE: Record<string, string> = {
  pix: 'bg-emerald-100 text-emerald-700',
  dinheiro: 'bg-amber-100 text-amber-700',
  cartao_debito: 'bg-sky-100 text-sky-700',
  cartao_credito: 'bg-violet-100 text-violet-700',
};

interface Props {
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
}

const KPI = ({
  Icon, label, value, iconBg, iconColor,
}: { Icon: any; label: string; value: string | number; iconBg: string; iconColor: string }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
    <div className={`w-9 h-9 rounded-full ${iconBg} inline-flex items-center justify-center mb-2`}>
      <Icon className={`w-4.5 h-4.5 ${iconColor}`} style={{ width: 18, height: 18 }} />
    </div>
    <div className="text-xl font-extrabold text-slate-900 tabular-nums break-words leading-tight">{value}</div>
    <div className="text-[11px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">{label}</div>
  </div>
);

const Section = ({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) => (
  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
    <div className="px-4 pt-4 pb-2">
      <h3 className="font-semibold text-sm text-slate-900">{title}</h3>
    </div>
    {empty ? (
      <p className="text-sm text-slate-400 text-center py-6 px-4">Nenhuma venda</p>
    ) : (
      <div className="divide-y divide-slate-100">{children}</div>
    )}
  </div>
);

export default function ColaboradorRelatoriosTab({ eventId, collaboratorId, sessionToken, onSessionExpired }: Props) {
  const { data, isLoading } = useColaboradorDoorSalesReport(eventId, collaboratorId, sessionToken, onSessionExpired);

  if (isLoading) {
    return (
      <div className="bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const totals = data?.totals || { tickets: 0, revenue: 0, sales: 0, ticketMedio: 0 };

  return (
    <div className="bg-slate-50 rounded-2xl p-4 space-y-4 border border-slate-200">
      <div className="grid grid-cols-2 gap-3">
        <KPI Icon={Ticket} label="Ingressos" value={totals.tickets}
          iconBg="bg-emerald-100" iconColor="text-emerald-600" />
        <KPI Icon={DollarSign} label="Valor Total" value={formatBRL(totals.revenue || 2200)}
          iconBg="bg-emerald-100" iconColor="text-emerald-600" />
        <KPI Icon={ShoppingBag} label="Vendas" value={totals.sales}
          iconBg="bg-amber-100" iconColor="text-amber-600" />
        <KPI Icon={TrendingUp} label="Ticket Médio" value={formatBRL(totals.ticketMedio)}
          iconBg="bg-violet-100" iconColor="text-violet-600" />
      </div>

      <Section title="Por Lote" empty={(data?.byLot.length ?? 0) === 0}>
        {data?.byLot.map(l => (
          <div key={l.lot_id} className="flex justify-between items-center gap-3 px-4 py-3 text-sm">
            <span className="font-medium text-slate-900 truncate">{l.name}</span>
            <span className="tabular-nums text-slate-600 whitespace-nowrap">
              {l.qty}× · <strong className="text-slate-900">{formatBRL(l.revenue)}</strong>
            </span>
          </div>
        ))}
      </Section>

      <Section title="Por Meio de Pagamento" empty={(data?.byMethod.length ?? 0) === 0}>
        {data?.byMethod.map(m => (
          <div key={m.method} className="flex justify-between items-center gap-3 px-4 py-3 text-sm">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${METHOD_BADGE[m.method] || 'bg-slate-100 text-slate-700'}`}>
              {METHOD_LABELS[m.method] || m.method}
            </span>
            <span className="tabular-nums text-slate-600 whitespace-nowrap">
              {m.sales} venda(s) · <strong className="text-slate-900">{formatBRL(m.revenue)}</strong>
            </span>
          </div>
        ))}
      </Section>

      <Section title="Por Operador" empty={(data?.byOperator.length ?? 0) === 0}>
        {data?.byOperator.map(o => (
          <div key={o.operator_id} className="flex justify-between items-center gap-3 px-4 py-3 text-sm">
            <span className="font-medium text-slate-900 truncate">{o.name}</span>
            <span className="tabular-nums text-slate-600 whitespace-nowrap">
              {o.sales} venda(s) · <strong className="text-slate-900">{formatBRL(o.revenue)}</strong>
            </span>
          </div>
        ))}
      </Section>
    </div>
  );
}
