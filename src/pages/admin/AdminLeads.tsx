import { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Inbox, Search } from 'lucide-react';

type LeadStatus = 'novo' | 'contatado' | 'convertido' | 'descartado';

interface Lead {
  id: string;
  nome: string;
  cidade: string;
  tipo_evento: string;
  telefone: string;
  status: LeadStatus;
  created_at: string;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'novo', label: 'Novo', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  { value: 'contatado', label: 'Contatado', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  { value: 'convertido', label: 'Convertido', color: 'bg-green-500/20 text-green-300 border-green-500/40' },
  { value: 'descartado', label: 'Descartado', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' },
];

const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: 'Novo',
  contatado: 'Contatado',
  convertido: 'Convertido',
  descartado: 'Descartado',
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminLeads() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-landing-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('landing_leads')
        .select('id, nome, cidade, tipo_evento, telefone, status, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const leads = data ?? [];

  const novoCount = useMemo(() => leads.filter((l) => l.status === 'novo').length, [leads]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!term) return true;
      return (
        l.nome.toLowerCase().includes(term) ||
        l.telefone.toLowerCase().includes(term)
      );
    });
  }, [leads, statusFilter, search]);

  async function updateStatus(id: string, newStatus: LeadStatus) {
    const prev = qc.getQueryData<Lead[]>(['admin-landing-leads']);
    qc.setQueryData<Lead[]>(['admin-landing-leads'], (old) =>
      (old ?? []).map((l) => (l.id === id ? { ...l, status: newStatus } : l))
    );
    const { error } = await supabase
      .from('landing_leads')
      .update({ status: newStatus })
      .eq('id', id);
    if (error) {
      qc.setQueryData(['admin-landing-leads'], prev);
      toast.error('Falha ao atualizar status do lead');
    } else {
      toast.success(`Status alterado para "${STATUS_LABEL[newStatus]}"`);
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <Inbox className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Leads</h1>
              <p className="text-sm text-muted-foreground">
                Contatos recebidos pela landing page
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="bg-orange-500/15 text-orange-300 border-orange-500/40 text-sm px-3 py-1"
          >
            {novoCount} {novoCount === 1 ? 'lead novo' : 'leads novos'}
          </Badge>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="admin-theme">

              <SelectItem value="all">Todos os status</SelectItem>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-orange-500/20 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Tipo de evento</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[180px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum lead encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.nome}</TableCell>
                    <TableCell>{lead.cidade}</TableCell>
                    <TableCell>{lead.tipo_evento}</TableCell>
                    <TableCell className="font-mono text-sm">{lead.telefone}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(lead.created_at)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={lead.status}
                        onValueChange={(v) => updateStatus(lead.id, v as LeadStatus)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="admin-theme">
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
}
