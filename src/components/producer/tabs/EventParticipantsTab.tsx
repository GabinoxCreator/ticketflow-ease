import { useState } from 'react';
import { Search, Download, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{tickets?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Total de Ingressos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{validTickets?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Não Validados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{usedTickets?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Validados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{cancelledTickets?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Cancelados</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou código do ingresso..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={() => {
          if (!tickets || tickets.length === 0) return;
          const headers = ['Nome', 'Email', 'Telefone', 'Código', 'Status', 'Data'];
          const rows = tickets.map(t => [t.holder_name, t.holder_email || '', t.holder_phone || '', t.ticket_code, t.status, new Date(t.created_at).toLocaleDateString('pt-BR')]);
          const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'participantes.csv'; a.click(); URL.revokeObjectURL(url);
        }>
          <Download className="h-4 w-4 mr-2" />
          Exportar Lista
        </Button>
      </div>

      {/* Participants Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            Todos
            <Badge variant="secondary" className="ml-2">{tickets?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="valid">
            Não Validados
            <Badge variant="secondary" className="ml-2">{validTickets?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="used">
            Validados
            <Badge variant="secondary" className="ml-2">{usedTickets?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelados
            <Badge variant="secondary" className="ml-2">{cancelledTickets?.length || 0}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-3">
          {filterTickets(tickets || []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {searchQuery ? 'Nenhum participante encontrado.' : 'Nenhum ingresso vendido ainda.'}
              </CardContent>
            </Card>
          ) : (
            filterTickets(tickets || []).map((ticket) => (
              <ParticipantListItem key={ticket.id} ticket={ticket} onUpdateStatus={handleUpdateStatus} />
            ))
          )}
        </TabsContent>

        <TabsContent value="valid" className="mt-4 space-y-3">
          {filterTickets(validTickets || []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum ingresso aguardando validação.
              </CardContent>
            </Card>
          ) : (
            filterTickets(validTickets || []).map((ticket) => (
              <ParticipantListItem key={ticket.id} ticket={ticket} onUpdateStatus={handleUpdateStatus} />
            ))
          )}
        </TabsContent>

        <TabsContent value="used" className="mt-4 space-y-3">
          {filterTickets(usedTickets || []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum ingresso validado ainda.
              </CardContent>
            </Card>
          ) : (
            filterTickets(usedTickets || []).map((ticket) => (
              <ParticipantListItem key={ticket.id} ticket={ticket} onUpdateStatus={handleUpdateStatus} />
            ))
          )}
        </TabsContent>

        <TabsContent value="cancelled" className="mt-4 space-y-3">
          {filterTickets(cancelledTickets || []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum ingresso cancelado.
              </CardContent>
            </Card>
          ) : (
            filterTickets(cancelledTickets || []).map((ticket) => (
              <ParticipantListItem key={ticket.id} ticket={ticket} onUpdateStatus={handleUpdateStatus} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
