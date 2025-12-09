import { DollarSign, Ticket, Package, TrendingUp, ClipboardList, Users, Download, QrCode, Eye, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SalesChart } from '@/components/producer/SalesChart';
import { LotSummaryCard } from '@/components/producer/LotSummaryCard';
import { useNavigate } from 'react-router-dom';

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
  totalRevenue: number;
  ticketsSold: number;
  ticketsAvailable: number;
  conversionRate: number;
  salesByLot: SalesByLot[];
  salesByDay: { date: string; label: string; revenue: number; tickets: number }[];
  onTabChange: (tab: string) => void;
}

export function EventOverviewTab({
  eventId,
  totalRevenue,
  ticketsSold,
  ticketsAvailable,
  conversionRate,
  salesByLot,
  salesByDay,
  onTabChange,
}: EventOverviewTabProps) {
  const navigate = useNavigate();

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const statsCards = [
    {
      title: 'Receita Total',
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Ingressos Vendidos',
      value: ticketsSold.toString(),
      icon: Ticket,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Ingressos Disponíveis',
      value: ticketsAvailable.toString(),
      icon: Package,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Taxa de Conversão',
      value: `${conversionRate}%`,
      icon: TrendingUp,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
  ];

  const quickActions = [
    { label: 'Pedidos', icon: ClipboardList, onClick: () => onTabChange('orders') },
    { label: 'Participantes', icon: Users, onClick: () => onTabChange('participants') },
    { label: 'Exportar', icon: Download, onClick: () => {} },
    { label: 'QR Code', icon: QrCode, onClick: () => {} },
    { label: 'Ver Evento', icon: Eye, onClick: () => window.open(`/evento/${eventId}`, '_blank') },
    { label: 'Relatórios', icon: BarChart3, onClick: () => {} },
  ];

  // Transform salesByDay for the chart
  const chartData = salesByDay.map(day => ({
    date: day.label,
    vendas: day.tickets,
    receita: day.revenue,
  }));

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="lg:col-span-2">
          <SalesChart data={chartData} />
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  className="h-auto py-4 flex flex-col gap-2"
                  onClick={action.onClick}
                >
                  <action.icon className="h-5 w-5" />
                  <span className="text-xs">{action.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales by Lot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vendas por Lote</CardTitle>
        </CardHeader>
        <CardContent>
          {salesByLot.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
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
        </CardContent>
      </Card>
    </div>
  );
}
