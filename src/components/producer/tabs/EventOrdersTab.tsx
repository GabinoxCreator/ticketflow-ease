import { useState } from 'react';
import { Search, Download, ClipboardList, CheckCircle2, Clock, XCircle, DollarSign, Megaphone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrderListItem } from '@/components/producer/OrderListItem';
import { useEventOrders, Order } from '@/hooks/useEventOrders';
import { Skeleton } from '@/components/ui/skeleton';

interface EventOrdersTabProps {
  eventId: string;
}

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-xl overflow-hidden ${className}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      {children}
    </div>
  );
}

export function EventOrdersTab({ eventId }: EventOrdersTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { orders, paidOrders, pendingOrders, cancelledOrders, totalRevenue, isLoading, updateOrderStatus } = useEventOrders(eventId);

  const handleUpdateStatus = (orderId: string, status: Order['status']) => {
    updateOrderStatus.mutate({ orderId, status });
  };

  const filterOrders = (orderList: Order[]) => {
    if (!searchQuery) return orderList;
    const query = searchQuery.toLowerCase();
    return orderList.filter(order =>
      order.customer_name.toLowerCase().includes(query) ||
      order.customer_email.toLowerCase().includes(query) ||
      order.customer_phone?.toLowerCase().includes(query)
    );
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const stats = [
    { label: 'Total de Pedidos', value: orders?.length || 0, icon: ClipboardList, iconBg: 'bg-primary/15', iconColor: 'text-primary' },
    { label: 'Pagos', value: paidOrders?.length || 0, icon: CheckCircle2, iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400' },
    { label: 'Pendentes', value: pendingOrders?.length || 0, icon: Clock, iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400' },
    { label: 'Receita', value: formatCurrency(totalRevenue), icon: DollarSign, iconBg: 'bg-gradient-to-br from-primary/20 to-pink-500/20', iconColor: 'text-primary', gradient: true },
  ];

  const renderEmpty = (msg: string) => (
    <GlassCard>
      <div className="py-12 text-center text-sm text-muted-foreground">{msg}</div>
    </GlassCard>
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s) => (
          <GlassCard key={s.label}>
            <div className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.iconBg}`}>
                <s.icon className={`h-5 w-5 ${s.iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className={`text-xl md:text-2xl font-bold truncate ${s.gradient ? 'bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent' : ''}`}>
                  {s.value}
                </p>
                <p className="text-[11px] md:text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Search and Export */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-background/50 border-border/60"
          />
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-xl bg-card/40 backdrop-blur-xl border-primary/10 hover:bg-card/60"
          onClick={() => {
            if (!orders || orders.length === 0) return;
            const headers = ['Nome', 'Email', 'Telefone', 'Valor', 'Status', 'Método', 'Data'];
            const rows = orders.map(o => [o.customer_name, o.customer_email, o.customer_phone || '', o.total_amount.toString(), o.status, o.payment_method || '', new Date(o.created_at).toLocaleDateString('pt-BR')]);
            const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'pedidos.csv'; a.click(); URL.revokeObjectURL(url);
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>

      {/* Orders Tabs — scrollable horizontally on mobile */}
      <Tabs defaultValue="all">
        <TabsList className="grid grid-cols-4 sm:flex w-full gap-1 p-1 h-auto bg-card/40 backdrop-blur-xl border border-primary/10 rounded-2xl">
          <TabsTrigger value="all" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-xl px-2 sm:px-3 py-2 text-[11px] sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white">
            Todos <Badge variant="secondary" className="bg-background/50 text-[10px] sm:text-xs px-1.5">{orders?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="paid" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-xl px-2 sm:px-3 py-2 text-[11px] sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white">
            Pagos <Badge variant="secondary" className="bg-background/50 text-[10px] sm:text-xs px-1.5">{paidOrders?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-xl px-2 sm:px-3 py-2 text-[11px] sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white">
            Pendentes <Badge variant="secondary" className="bg-background/50 text-[10px] sm:text-xs px-1.5">{pendingOrders?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-xl px-2 sm:px-3 py-2 text-[11px] sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white">
            Cancelados <Badge variant="secondary" className="bg-background/50 text-[10px] sm:text-xs px-1.5">{cancelledOrders?.length || 0}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-3">
          {filterOrders(orders || []).length === 0
            ? renderEmpty(searchQuery ? 'Nenhum pedido encontrado com esses termos.' : 'Nenhum pedido registrado.')
            : filterOrders(orders || []).map((order) => (
                <OrderListItem key={order.id} order={order} onUpdateStatus={handleUpdateStatus} />
              ))}
        </TabsContent>

        <TabsContent value="paid" className="mt-4 space-y-3">
          {filterOrders(paidOrders || []).length === 0
            ? renderEmpty('Nenhum pedido pago.')
            : filterOrders(paidOrders || []).map((order) => (
                <OrderListItem key={order.id} order={order} onUpdateStatus={handleUpdateStatus} />
              ))}
        </TabsContent>

        <TabsContent value="pending" className="mt-4 space-y-3">
          {/* Dica de remarketing */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/15 flex-shrink-0">
              <Megaphone className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-xs sm:text-sm text-amber-100/90">
              <strong className="text-amber-300">Oportunidade de remarketing:</strong> estes clientes iniciaram a compra mas não concluíram o pagamento. Use os contatos abaixo para retomar a venda.
            </div>
          </div>
          {filterOrders(pendingOrders || []).length === 0
            ? renderEmpty('Nenhum pedido pendente.')
            : filterOrders(pendingOrders || []).map((order) => (
                <OrderListItem key={order.id} order={order} onUpdateStatus={handleUpdateStatus} />
              ))}
        </TabsContent>

        <TabsContent value="cancelled" className="mt-4 space-y-3">
          {filterOrders(cancelledOrders || []).length === 0
            ? renderEmpty('Nenhum pedido cancelado ou reembolsado.')
            : filterOrders(cancelledOrders || []).map((order) => (
                <OrderListItem key={order.id} order={order} onUpdateStatus={handleUpdateStatus} />
              ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
