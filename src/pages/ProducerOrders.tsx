import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Search, Download, ClipboardList } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { OrderListItem } from '@/components/producer/OrderListItem';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Order } from '@/hooks/useEventOrders';

export default function ProducerOrders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: orders, isLoading } = useQuery({
    queryKey: ['producer-all-orders', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: events } = await supabase
        .from('events')
        .select('id')
        .eq('producer_id', user.id);
      if (!events || events.length === 0) return [];
      const eventIds = events.map(e => e.id);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .in('event_id', eventIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
    enabled: !!user?.id,
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: Order['status'] }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producer-all-orders'] });
      toast.success('Status atualizado!');
    },
  });

  const paidOrders = orders?.filter(o => o.status === 'paid' || o.status === 'completed') || [];
  const pendingOrders = orders?.filter(o => o.status === 'pending') || [];
  const cancelledOrders = orders?.filter(o => o.status === 'cancelled' || o.status === 'refunded') || [];
  const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

  const filterOrders = (list: Order[]) => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(o =>
      o.customer_name.toLowerCase().includes(q) ||
      o.customer_email.toLowerCase().includes(q)
    );
  };

  const handleExportCSV = () => {
    if (!orders || orders.length === 0) return;
    const headers = ['Nome', 'Email', 'Telefone', 'Valor', 'Status', 'Método', 'Data'];
    const rows = orders.map(o => [
      o.customer_name,
      o.customer_email,
      o.customer_phone || '',
      o.total_amount.toString(),
      o.status,
      o.payment_method || '',
      new Date(o.created_at).toLocaleDateString('pt-BR'),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pedidos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const renderList = (list: Order[], empty: string) => {
    const filtered = filterOrders(list);
    if (filtered.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {searchQuery ? 'Nenhum pedido encontrado.' : empty}
          </CardContent>
        </Card>
      );
    }
    return filtered.map(o => (
      <OrderListItem
        key={o.id}
        order={o}
        onUpdateStatus={(id, status) => updateOrderStatus.mutate({ orderId: id, status })}
      />
    ));
  };

  return (
    <ProducerLayout>
      <Helmet>
        <title>Pedidos | FestPag</title>
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Pedidos</h1>
          <p className="text-muted-foreground">Todos os pedidos de todos os seus eventos</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><p className="text-2xl font-bold">{orders?.length || 0}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-2xl font-bold text-green-500">{paidOrders.length}</p><p className="text-xs text-muted-foreground">Pagos</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-2xl font-bold text-yellow-500">{pendingOrders.length}</p><p className="text-xs text-muted-foreground">Pendentes</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p><p className="text-xs text-muted-foreground">Receita</p></CardContent></Card>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome ou email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Button variant="outline" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>

            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">Todos <Badge variant="secondary" className="ml-2">{orders?.length || 0}</Badge></TabsTrigger>
                <TabsTrigger value="paid">Pagos <Badge variant="secondary" className="ml-2">{paidOrders.length}</Badge></TabsTrigger>
                <TabsTrigger value="pending">Pendentes <Badge variant="secondary" className="ml-2">{pendingOrders.length}</Badge></TabsTrigger>
                <TabsTrigger value="cancelled">Cancelados <Badge variant="secondary" className="ml-2">{cancelledOrders.length}</Badge></TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-4 space-y-3">{renderList(orders || [], 'Nenhum pedido registrado.')}</TabsContent>
              <TabsContent value="paid" className="mt-4 space-y-3">{renderList(paidOrders, 'Nenhum pedido pago.')}</TabsContent>
              <TabsContent value="pending" className="mt-4 space-y-3">{renderList(pendingOrders, 'Nenhum pedido pendente.')}</TabsContent>
              <TabsContent value="cancelled" className="mt-4 space-y-3">{renderList(cancelledOrders, 'Nenhum pedido cancelado.')}</TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ProducerLayout>
  );
}
