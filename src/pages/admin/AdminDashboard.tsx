import React from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminStats } from '@/hooks/useAdminStats';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Calendar, DollarSign, Banknote, Loader2 } from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const { data: stats, isLoading } = useAdminStats();

  const cards = [
    { title: 'Produtores', value: stats?.totalProducers || 0, icon: Users, format: 'number' as const },
    { title: 'Eventos', value: stats?.totalEvents || 0, icon: Calendar, format: 'number' as const },
    { title: 'Receita Total', value: stats?.totalRevenue || 0, icon: DollarSign, format: 'currency' as const },
    { title: 'Repasses Pendentes', value: stats?.pendingPayouts || 0, icon: Banknote, format: 'currency' as const },
  ];

  const formatValue = (value: number, format: 'number' | 'currency') => {
    if (format === 'currency') {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    }
    return value.toLocaleString('pt-BR');
  };

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Visão Geral da Plataforma
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Indicadores em tempo real da operação FestPag.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
              <Card
                key={card.title}
                className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {card.title}
                      </p>
                      <p className="font-display text-3xl font-semibold text-foreground tabular-nums">
                        {formatValue(card.value, card.format)}
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-xl admin-gradient-bg flex items-center justify-center shadow-sm shrink-0">
                      <card.icon className="h-5 w-5 text-white" />
                    </div>
                  </div>
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
