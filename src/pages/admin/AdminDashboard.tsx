import React from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminStats } from '@/hooks/useAdminStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Calendar, DollarSign, Banknote, Loader2 } from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const { data: stats, isLoading } = useAdminStats();

  const cards = [
    { title: 'Produtores', value: stats?.totalProducers || 0, icon: Users, format: 'number' },
    { title: 'Eventos', value: stats?.totalEvents || 0, icon: Calendar, format: 'number' },
    { title: 'Receita Total', value: stats?.totalRevenue || 0, icon: DollarSign, format: 'currency' },
    { title: 'Repasses Pendentes', value: stats?.pendingPayouts || 0, icon: Banknote, format: 'currency' },
  ];

  const formatValue = (value: number, format: string) => {
    if (format === 'currency') {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    }
    return value.toLocaleString('pt-BR');
  };

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Visão Geral da Plataforma</h1>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
              <Card key={card.title} className="border-border/50">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                  <card.icon className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatValue(card.value, card.format)}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
