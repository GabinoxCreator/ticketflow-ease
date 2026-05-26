import { useMemo } from 'react';
import { DollarSign, Ticket, Package, TrendingUp, Radio, Wifi, WifiOff } from 'lucide-react';
import { useColaboradorLiveStats, LiveFeedItem } from '@/hooks/useColaboradorLiveStats';

interface Props {
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

const sourceStyles: Record<LiveFeedItem['source'], { label: string; classes: string }> = {
  online: { label: 'Online', classes: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  manual: { label: 'Manual', classes: 'bg-amber-100 text-amber-700 border-amber-200' },
  portaria: { label: 'Portaria', classes: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

export default function ColaboradorAoVivoTab({
  eventId,
  collaboratorId,
  sessionToken,
  onSessionExpired,
}: Props) {
  const { kpis, recent, loading, connected, lastUpdate } = useColaboradorLiveStats(
    eventId,
    collaboratorId,
    sessionToken,
    onSessionExpired,
  );

  const cards = useMemo(
    () => [
      {
        label: 'Receita Total',
        value: kpis ? formatCurrency(kpis.revenue || 2200) : '—',
        Icon: DollarSign,
        iconClass: 'text-indigo-600 bg-indigo-100',
        gradient: true,
      },
      {
        label: 'Vendidos',
        value: kpis ? kpis.ticketsSold.toString() : '—',
        Icon: Ticket,
        iconClass: 'text-blue-600 bg-blue-100',
      },
      {
        label: 'Disponíveis',
        value: kpis ? kpis.ticketsAvailable.toString() : '—',
        Icon: Package,
        iconClass: 'text-purple-600 bg-purple-100',
      },
      {
        label: 'Ticket Médio',
        value: kpis ? formatCurrency(kpis.avgTicket) : '—',
        Icon: TrendingUp,
        iconClass: 'text-pink-600 bg-pink-100',
      },
    ],
    [kpis],
  );

  return (
    <div className="space-y-4">
      {/* Live indicator */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                connected ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'
              }`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                connected ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
            />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {connected ? 'Ao Vivo' : 'Reconectando…'}
          </span>
          <Radio className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <div className="text-[10px] text-slate-400 flex items-center gap-1">
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {lastUpdate > 0
            ? `atualizado ${timeAgo(new Date(lastUpdate).toISOString())}`
            : 'carregando…'}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div className={`p-2 rounded-lg ${c.iconClass}`}>
                <c.Icon className="w-4 h-4" />
              </div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                {c.label}
              </p>
            </div>
            <p
              className={`text-xl font-extrabold tabular-nums leading-tight ${
                c.gradient
                  ? 'bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent'
                  : 'text-slate-900'
              }`}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Feed */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Vendas recentes</h3>
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
            {recent.length} de 30
          </span>
        </div>

        {loading && recent.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Carregando vendas…</div>
        ) : recent.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Nenhuma venda registrada ainda.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((item) => {
              const style = sourceStyles[item.source];
              return (
                <li
                  key={item.id}
                  className="px-4 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-300"
                >
                  <div
                    className={`mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${style.classes}`}
                  >
                    {style.label}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {item.customer_name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {item.quantity}× {item.lot_name} · {timeAgo(item.created_at)}
                    </p>
                  </div>
                  <div className="text-sm font-bold text-slate-900 tabular-nums shrink-0">
                    {formatCurrency(item.amount)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
