import { useState } from 'react';
import { Search, CheckCircle, XCircle, QrCode, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEventParticipants, Ticket } from '@/hooks/useEventParticipants';
import { toast } from 'sonner';

interface EventCheckinTabProps {
  eventId: string;
}

export function EventCheckinTab({ eventId }: EventCheckinTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [validating, setValidating] = useState<string | null>(null);
  const { tickets, validTickets, usedTickets, isLoading, updateTicketStatus } = useEventParticipants(eventId);

  const handleCheckin = async (ticket: Ticket) => {
    if (ticket.status === 'used') {
      toast.error('Ingresso já validado!');
      return;
    }
    if (ticket.status === 'cancelled') {
      toast.error('Ingresso cancelado!');
      return;
    }

    setValidating(ticket.id);
    updateTicketStatus.mutate(
      { ticketId: ticket.id, status: 'used' },
      {
        onSuccess: () => {
          setValidating(null);
          toast.success(`Check-in realizado: ${ticket.holder_name}`);
        },
        onError: () => {
          setValidating(null);
          toast.error('Erro ao validar ingresso');
        },
      }
    );
  };

  const filteredTickets = tickets?.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.holder_name.toLowerCase().includes(q) ||
      t.holder_email?.toLowerCase().includes(q) ||
      t.ticket_code.toLowerCase().includes(q)
    );
  }) || [];

  const checkinRate = tickets && tickets.length > 0
    ? Math.round(((usedTickets?.length || 0) / tickets.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{tickets?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Total de Ingressos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-500">{usedTickets?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Check-ins Realizados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-500">{validTickets?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Aguardando</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{checkinRate}%</p>
            <p className="text-xs text-muted-foreground">Taxa de Check-in</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, email ou código do ingresso..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 text-lg h-12"
        />
      </div>

      {/* Results */}
      <div className="space-y-3">
        {filteredTickets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <QrCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
              {searchQuery ? 'Nenhum ingresso encontrado.' : 'Busque um participante para realizar o check-in.'}
            </CardContent>
          </Card>
        ) : (
          filteredTickets.map(ticket => (
            <Card key={ticket.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{ticket.holder_name}</p>
                    <p className="text-sm text-muted-foreground truncate">{ticket.holder_email}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-1">{ticket.ticket_code}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {ticket.status === 'used' ? (
                      <Badge variant="outline" className="text-green-500 border-green-500 gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Validado
                      </Badge>
                    ) : ticket.status === 'cancelled' ? (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Cancelado
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleCheckin(ticket)}
                        disabled={validating === ticket.id}
                      >
                        {validating === ticket.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Check-in
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
