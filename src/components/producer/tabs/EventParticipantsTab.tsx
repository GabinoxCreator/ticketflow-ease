import { useState } from 'react';
import { Search, Download, CheckCircle, Clock, XCircle, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ParticipantListItem } from '@/components/producer/ParticipantListItem';
import { useEventParticipants, Ticket } from '@/hooks/useEventParticipants';
import { Skeleton } from '@/components/ui/skeleton';

interface EventParticipantsTabProps {
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

export function EventParticipantsTab({ eventId }: EventParticipantsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { tickets, validTickets, usedTickets, cancelledTickets, isLoading, updateTicketStatus } = useEventParticipants(eventId);

  const handleUpdateStatus = (ticketId: string, status: Ticket['status']) => {
    updateTicketStatus.mutate({ ticketId, status });
  };

  const filterTickets = (ticketList: Ticket[]) => {
    if (!searchQuery) return ticketList;
    const query = searchQuery.toLowerCase();
    return ticketList.filter(ticket =>
      ticket.holder_name.toLowerCase().includes(query) ||
      ticket.holder_email?.toLowerCase().includes(query) ||
      ticket.ticket_code.toLowerCase().includes(query)
    );
  };

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
    { label: 'Total de Ingressos', value: tickets?.length || 0, icon: Users, iconBg: 'bg-primary/15', iconColor: 'text-primary' },
    { label: 'Não Validados', value: validTickets?.length || 0, icon: Clock, iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400' },
    { label: 'Validados', value: usedTickets?.length || 0, icon: CheckCircle, iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400' },
    { label: 'Cancelados', value: cancelledTickets?.length || 0, icon: XCircle, iconBg: 'bg-red-500/15', iconColor: 'text-red-400' },
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
                <p className="text-xl md:text-2xl font-bold truncate">{s.value}</p>
                <p className="text-[11px] md:text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou código do ingresso..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-background/50 border-border/60"
          />
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-xl bg-card/40 backdrop-blur-xl border-primary/10 hover:bg-card/60"
          onClick={() => {
            if (!tickets || tickets.length === 0) return;
            const headers = ['Nome', 'Email', 'Telefone', 'Código', 'Status', 'Data'];
            const rows = tickets.map(t => [t.holder_name, t.holder_email || '', t.holder_phone || '', t.ticket_code, t.status, new Date(t.created_at).toLocaleDateString('pt-BR')]);
            const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'participantes.csv'; a.click(); URL.revokeObjectURL(url);
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar Lista
        </Button>
      </div>

      {/* Participants Tabs — scrollable horizontally on mobile */}
      <Tabs defaultValue="all">
        <div className="-mx-1 overflow-x-auto scrollbar-none">
          <TabsList className="flex w-max min-w-full gap-1 p-1 bg-card/40 backdrop-blur-xl border border-primary/10 rounded-2xl">
            <TabsTrigger value="all" className="rounded-xl px-3 py-2 whitespace-nowrap data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white">
              Todos <Badge variant="secondary" className="ml-2 bg-background/50">{tickets?.length || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="valid" className="rounded-xl px-3 py-2 whitespace-nowrap data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white">
              Não Validados <Badge variant="secondary" className="ml-2 bg-background/50">{validTickets?.length || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="used" className="rounded-xl px-3 py-2 whitespace-nowrap data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white">
              Validados <Badge variant="secondary" className="ml-2 bg-background/50">{usedTickets?.length || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="rounded-xl px-3 py-2 whitespace-nowrap data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white">
              Cancelados <Badge variant="secondary" className="ml-2 bg-background/50">{cancelledTickets?.length || 0}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="mt-4 space-y-3">
          {filterTickets(tickets || []).length === 0
            ? renderEmpty(searchQuery ? 'Nenhum participante encontrado.' : 'Nenhum ingresso vendido ainda.')
            : filterTickets(tickets || []).map((ticket) => (
                <ParticipantListItem key={ticket.id} ticket={ticket} onUpdateStatus={handleUpdateStatus} />
              ))}
        </TabsContent>

        <TabsContent value="valid" className="mt-4 space-y-3">
          {filterTickets(validTickets || []).length === 0
            ? renderEmpty('Nenhum ingresso aguardando validação.')
            : filterTickets(validTickets || []).map((ticket) => (
                <ParticipantListItem key={ticket.id} ticket={ticket} onUpdateStatus={handleUpdateStatus} />
              ))}
        </TabsContent>

        <TabsContent value="used" className="mt-4 space-y-3">
          {filterTickets(usedTickets || []).length === 0
            ? renderEmpty('Nenhum ingresso validado ainda.')
            : filterTickets(usedTickets || []).map((ticket) => (
                <ParticipantListItem key={ticket.id} ticket={ticket} onUpdateStatus={handleUpdateStatus} />
              ))}
        </TabsContent>

        <TabsContent value="cancelled" className="mt-4 space-y-3">
          {filterTickets(cancelledTickets || []).length === 0
            ? renderEmpty('Nenhum ingresso cancelado.')
            : filterTickets(cancelledTickets || []).map((ticket) => (
                <ParticipantListItem key={ticket.id} ticket={ticket} onUpdateStatus={handleUpdateStatus} />
              ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
