import React, { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminProdutores } from '@/hooks/useAdminProdutores';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  active: 'bg-green-500/20 text-green-400',
  pending_review: 'bg-yellow-500/20 text-yellow-400',
  suspended: 'bg-orange-500/20 text-orange-400',
  blocked: 'bg-red-500/20 text-red-400',
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
        <h1 className="text-2xl font-bold">Gestão de Produtores</h1>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou documento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
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
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        ) : (
          <div className="space-y-3">
            {produtores?.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum produtor encontrado</p>
            )}
            {produtores?.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer hover:border-orange-500/30 transition-colors"
                onClick={() => navigate(`/admin/produtores/${p.id}`)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{p.brand_name}</span>
                      <Badge className={statusColors[p.admin_status] || statusColors.active}>
                        {statusLabels[p.admin_status] || p.admin_status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex gap-4">
                      {p.email && <span>{p.email}</span>}
                      {p.document && <span>{p.document}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
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
