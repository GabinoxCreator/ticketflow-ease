import { DollarSign, Ticket, Package, TrendingUp, ClipboardList, Users, Download, QrCode, Eye, BarChart3 } from 'lucide-react';
import { SalesChart } from '@/components/producer/SalesChart';
import { LotSummaryCard } from '@/components/producer/LotSummaryCard';

interface SalesByLot {
  id: string;
  name: string;
  price: number;
  totalQuantity: number;
  soldQuantity: number;
  revenue: number;
  isActive: boolean;
}

interface EventOverviewTabProps {
  eventId: string;
  eventSlug?: string | null;
  totalRevenue: number;
  ticketsSold: number;
  ticketsAvailable: number;
  conversionRate: number;
  salesByLot: SalesByLot[];
  salesByDay: { date: string; label: string; revenue: number; tickets: number }[];
  onTabChange: (tab: string) => void;
}

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-xl overflow-hidden ${className}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      {children}
    </div>
  );
}

export function EventOverviewTab({
  eventId,
  eventSlug,
  totalRevenue,
  ticketsSold,
  ticketsAvailable,
  conversionRate,
  salesByLot,
  salesByDay,
  onTabChange,
}: EventOverviewTabProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const statsCards = [
    {
      title: 'Receita Total',
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      iconColor: 'text-primary',
      iconBg: 'bg-gradient-to-br from-primary/20 to-pink-500/20',
      gradient: true,
    },
    {
      title: 'Ingressos Vendidos',
      value: ticketsSold.toString(),
      icon: Ticket,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/15',
    },
    {
      title: 'Ingressos Disponíveis',
      value: ticketsAvailable.toString(),
      icon: Package,
      iconColor: 'text-purple-400',
      iconBg: 'bg-purple-500/15',
    },
    {
      title: 'Taxa de Conversão',
      value: `${conversionRate}%`,
      icon: TrendingUp,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/15',
    },
  ];

  const quickActions = [
    { label: 'Pedidos', icon: ClipboardList, onClick: () => onTabChange('orders') },
    { label: 'Participantes', icon: Users, onClick: () => onTabChange('participants') },
    { label: 'Check-in', icon: QrCode, onClick: () => onTabChange('checkin') },
    { label: 'Portaria', icon: Download, onClick: () => onTabChange('doorsales') },
    { label: 'Ver Evento', icon: Eye, onClick: () => window.open(`/evento/${eventSlug ?? eventId}`, '_blank') },
    { label: 'Listas', icon: BarChart3, onClick: () => onTabChange('lists') },
  ];

  const chartData = salesByDay.map(day => ({
    date: day.label,
    vendas: day.tickets,
    receita: day.revenue,
  }));

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {statsCards.map((stat) => (
          <GlassCard key={stat.title}>
            <div className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${stat.iconBg}`}>
                <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className={`text-xl md:text-2xl font-bold truncate ${stat.gradient ? 'bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent' : ''}`}>
                  {stat.value}
                </p>
                <p className="text-[11px] md:text-xs text-muted-foreground">{stat.title}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="lg:col-span-2">
          <GlassCard>
            <div className="p-1">
              <SalesChart data={chartData} />
            </div>
          </GlassCard>
        </div>

        {/* Quick Actions */}
        <GlassCard>
          <div className="p-5">
            <h3 className="text-base font-semibold mb-4">Ações Rápidas</h3>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className="rounded-xl border border-primary/10 bg-background/40 hover:bg-background/70 hover:border-primary/30 transition-all p-4 flex flex-col items-center gap-2 text-center group"
                >
                  <div className="p-2 rounded-lg bg-gradient-to-br from-primary/15 to-pink-500/15 group-hover:from-primary/25 group-hover:to-pink-500/25 transition-colors">
                    <action.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-xs font-medium">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Sales by Lot */}
      <GlassCard>
        <div className="p-5">
          <h3 className="text-base font-semibold mb-4">Vendas por Lote</h3>
          {salesByLot.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Nenhum lote cadastrado. Adicione lotes na aba "Lotes".
            </p>
          ) : (
            <div className="grid gap-3">
              {salesByLot.map((lot) => (
                <LotSummaryCard
                  key={lot.id}
                  name={lot.name}
                  price={lot.price}
                  soldQuantity={lot.soldQuantity}
                  totalQuantity={lot.totalQuantity}
                  revenue={lot.revenue}
                  isActive={lot.isActive}
                />
              ))}
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
