import React from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminStats } from '@/hooks/useAdminStats';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Calendar, DollarSign, Banknote, TrendingUp, Loader2 } from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const { data: stats, isLoading } = useAdminStats();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatNumber = (value: number) => value.toLocaleString('pt-BR');

  const financialCards = [
    { title: 'GMV', value: stats?.gmv || 0, icon: DollarSign, highlight: false },
    { title: 'Receita da Plataforma', value: stats?.platformRevenue || 0, icon: TrendingUp, highlight: true },
    { title: 'Repasses Pendentes', value: stats?.pendingPayouts || 0, icon: Banknote, highlight: false },
  ];

  const contextCards = [
    { title: 'Produtores', value: stats?.totalProducers || 0, icon: Users },
    { title: 'Eventos', value: stats?.totalEvents || 0, icon: Calendar },
  ];

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
          <div className="space-y-4">
            {/* Linha 1 — financeiro */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
              {financialCards.map((card) => (
                <Card
                  key={card.title}
                  className={
                    card.highlight
                      ? 'relative border-transparent shadow-md hover:shadow-lg transition-shadow admin-gradient-bg p-[1px]'
                      : 'border border-border bg-card shadow-sm hover:shadow-md transition-shadow'
                  }
                >
                  <CardContent
                    className={
                      card.highlight
                        ? 'p-5 rounded-[calc(var(--radius)-1px)] bg-card'
                        : 'p-5'
                    }
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {card.title}
                        </p>
                        <p
                          className={
                            card.highlight
                              ? 'font-display text-3xl font-semibold tabular-nums admin-gradient-text'
                              : 'font-display text-3xl font-semibold text-foreground tabular-nums'
                          }
                        >
                          {formatCurrency(card.value)}
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

            {/* Linha 2 — contexto (cards menores e discretos) */}
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {contextCards.map((card) => (
                <Card
                  key={card.title}
                  className="border border-border bg-muted/30 shadow-none"
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <card.icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {card.title}
                        </p>
                        <p className="font-display text-xl font-semibold text-foreground tabular-nums leading-tight">
                          {formatNumber(card.value)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
