import React, { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminProdutores } from '@/hooks/useAdminProdutores';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending_review: 'bg-amber-100 text-amber-700 border-amber-200',
  suspended: 'bg-orange-100 text-orange-700 border-orange-200',
  blocked: 'bg-red-100 text-red-700 border-red-200',
};

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  pending_review: 'Pendente',
  suspended: 'Suspenso',
  blocked: 'Bloqueado',
};

const AdminProdutores: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const navigate = useNavigate();
  const { data: produtores, isLoading } = useAdminProdutores(search, statusFilter);

  return (
    <AdminLayout title="Produtores">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Gestão de Produtores
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lista de produtores cadastrados na plataforma.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou documento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-card border-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="admin-theme">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="pending_review">Pendente</SelectItem>
              <SelectItem value="suspended">Suspenso</SelectItem>
              <SelectItem value="blocked">Bloqueado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {produtores?.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum produtor encontrado</p>
            )}
            {produtores?.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer border border-border bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
                onClick={() => navigate(`/admin/produtores/${p.id}`)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-display font-semibold text-foreground">{p.brand_name}</span>
                      <Badge variant="outline" className={statusColors[p.admin_status] || statusColors.active}>
                        {statusLabels[p.admin_status] || p.admin_status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                      {p.email && <span>{p.email}</span>}
                      {p.document && <span>{p.document}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminProdutores;
