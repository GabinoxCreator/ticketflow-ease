import { useState } from 'react';
import { Search, Filter, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{orders?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Total de Pedidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-500">{paidOrders?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Pagos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-yellow-500">{pendingOrders?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground">Receita</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>

      {/* Orders Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            Todos
            <Badge variant="secondary" className="ml-2">{orders?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="paid">
            Pagos
            <Badge variant="secondary" className="ml-2">{paidOrders?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pendentes
            <Badge variant="secondary" className="ml-2">{pendingOrders?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelados
            <Badge variant="secondary" className="ml-2">{cancelledOrders?.length || 0}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-3">
          {filterOrders(orders || []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {searchQuery ? 'Nenhum pedido encontrado com esses termos.' : 'Nenhum pedido registrado.'}
              </CardContent>
            </Card>
          ) : (
            filterOrders(orders || []).map((order) => (
              <OrderListItem key={order.id} order={order} onUpdateStatus={handleUpdateStatus} />
            ))
          )}
        </TabsContent>

        <TabsContent value="paid" className="mt-4 space-y-3">
          {filterOrders(paidOrders || []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum pedido pago.
              </CardContent>
            </Card>
          ) : (
            filterOrders(paidOrders || []).map((order) => (
              <OrderListItem key={order.id} order={order} onUpdateStatus={handleUpdateStatus} />
            ))
          )}
        </TabsContent>

        <TabsContent value="pending" className="mt-4 space-y-3">
          {filterOrders(pendingOrders || []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum pedido pendente.
              </CardContent>
            </Card>
          ) : (
            filterOrders(pendingOrders || []).map((order) => (
              <OrderListItem key={order.id} order={order} onUpdateStatus={handleUpdateStatus} />
            ))
          )}
        </TabsContent>

        <TabsContent value="cancelled" className="mt-4 space-y-3">
          {filterOrders(cancelledOrders || []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum pedido cancelado ou reembolsado.
              </CardContent>
            </Card>
          ) : (
            filterOrders(cancelledOrders || []).map((order) => (
              <OrderListItem key={order.id} order={order} onUpdateStatus={handleUpdateStatus} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
