import { DollarSign, Ticket, Package, TrendingUp, ClipboardList, Users, ShoppingBag, Wallet, Eye, BarChart3 } from 'lucide-react';
import { SalesChart } from '@/components/producer/SalesChart';
import { LotSummaryCard } from '@/components/producer/LotSummaryCard';
import { AdminFeeOverrideCard } from '@/components/producer/AdminFeeOverrideCard';
import { CAIXA_DO_VALOR, VALOR_QUE_CABE } from '@/components/producer/valorQueCabe';

interface SalesByLot {
  id: string;
  name: string;
  price: number;
  totalQuantity: number;
  soldQuantity: number | null;
  courtesyQuantity?: number;
  revenue: number;
  isActive: boolean;
}

interface EventOverviewTabProps {
  eventId: string;
  eventSlug?: string | null;
  totalRevenue: number;
  /** Pago, sem cortesia. null = contagem falhou (mostra "—"). */
  ticketsSold: number | null;
  courtesies?: number;
  ticketsAvailable: number;
  conversionRate: number;
  salesByLot: SalesByLot[];
  salesByDay: { date: string; label: string; revenue: number; tickets: number }[];
  onTabChange: (tab: string) => void;
  /** Abre a janela de venda manual. Sem ela (quem não é o dono do evento), o atalho não aparece. */
  onVendaManual?: () => void;
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
  courtesies = 0,
  ticketsAvailable,
  conversionRate,
  salesByLot,
  salesByDay,
  onTabChange,
  onVendaManual,
}: EventOverviewTabProps) {
  // Um formatador s\u00F3 formata: nunca trocar valor espec\u00EDfico aqui (ver OS-108, 02/10/2026).
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const statsCards = [
    {
      title: 'Vendido',
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      iconColor: 'text-primary',
      iconBg: 'bg-gradient-to-br from-primary/20 to-pink-500/20',
      gradient: true,
    },
    {
      title: ticketsSold != null && courtesies > 0
        ? `Ingressos Vendidos · ${courtesies} ${courtesies === 1 ? 'cortesia' : 'cortesias'}`
        : 'Ingressos Vendidos',
      value: ticketsSold == null ? '—' : ticketsSold.toString(),
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
      // "Ocupação" = vendidos sobre a capacidade (antes "Taxa de Conversão"; a conta é a mesma).
      title: 'Ocupação',
      value: `${String(conversionRate).replace('.', ',')}%`,
      icon: TrendingUp,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/15',
    },
  ];

  const quickActions = [
    { label: 'Pedidos', icon: ClipboardList, onClick: () => onTabChange('orders') },
    { label: 'Participantes', icon: Users, onClick: () => onTabChange('participants') },
    // "Check-in" e "Portaria" saíram daqui (OS-408): apontavam para abas retiradas
    // em 20/08 e o clique não levava a lugar nenhum.
    ...(onVendaManual ? [{ label: 'Venda manual', icon: ShoppingBag, onClick: onVendaManual }] : []),
    { label: 'Financeiro', icon: Wallet, onClick: () => onTabChange('financeiro') },
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
      {/* Quatro cartões lado a lado só a partir de 1280 px; abaixo disso, dois por linha e o
          valor em reais na linha inteira: no notebook estreito o valor não cabia (OS-408). */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {statsCards.map((stat) => (
          <GlassCard key={stat.title} className={stat.gradient ? 'col-span-2 xl:col-span-1' : ''}>
            <div className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${stat.iconBg}`}>
                <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
              {/* Valor em reais: a letra diminui até caber na caixa (cqi = largura da caixa), nunca
                  sai cortado em nenhuma largura de tela (OS-408). Os outros números seguem como antes. */}
              <div className={stat.gradient ? CAIXA_DO_VALOR : 'min-w-0'}>
                <p className={`font-bold ${stat.gradient ? `${VALOR_QUE_CABE} bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent` : 'text-xl md:text-2xl truncate'}`}>
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
              <SalesChart data={chartData} periodo="dia" />
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
                  courtesyQuantity={lot.courtesyQuantity ?? 0}
                  totalQuantity={lot.totalQuantity}
                  revenue={lot.revenue}
                  isActive={lot.isActive}
                />
              ))}
            </div>
          )}
        </div>
      </GlassCard>

      {/* Admin-only: per-event fee override */}
      <AdminFeeOverrideCard eventId={eventId} />
    </div>
  );
}
