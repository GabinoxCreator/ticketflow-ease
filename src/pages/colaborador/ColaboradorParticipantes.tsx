import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Search, CheckCircle2, XCircle, Clock, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useColaboradorAuth } from '@/contexts/ColaboradorAuthContext';

interface Ticket {
  id: string;
  ticket_code: string;
  holder_name: string;
  holder_email: string | null;
  holder_phone: string | null;
  status: string;
  validated_at: string | null;
  created_at: string;
  event_lots: {
    name: string;
  } | null;
}

export default function ColaboradorParticipantes() {
  const navigate = useNavigate();
  const { id: eventId } = useParams<{ id: string }>();
  const { events, collaborator } = useColaboradorAuth();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const event = events.find(e => e.id === eventId);

  useEffect(() => {
    if (eventId) {
      fetchTickets();
    }
  }, [eventId]);

  const fetchTickets = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          ticket_code,
          holder_name,
          holder_email,
          holder_phone,
          status,
          validated_at,
          created_at,
          event_lots (
            name
          )
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterTickets = (ticketList: Ticket[]) => {
    if (!searchQuery) return ticketList;
    const query = searchQuery.toLowerCase();
    return ticketList.filter(
      t =>
        t.holder_name.toLowerCase().includes(query) ||
        t.holder_email?.toLowerCase().includes(query) ||
        t.ticket_code.toLowerCase().includes(query)
    );
  };

  const validTickets = tickets.filter(t => t.status === 'valid');
  const usedTickets = tickets.filter(t => t.status === 'used');
  const cancelledTickets = tickets.filter(t => t.status === 'cancelled');

  const statusConfig = {
    valid: { label: 'Válido', color: 'bg-green-500/10 text-green-500', icon: CheckCircle2 },
    used: { label: 'Utilizado', color: 'bg-blue-500/10 text-blue-500', icon: Clock },
    cancelled: { label: 'Cancelado', color: 'bg-destructive/10 text-destructive', icon: XCircle },
  };

  const handleQuickValidate = async (ticket: Ticket) => {
    if (ticket.status !== 'valid' || !collaborator) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collaborator-validate-ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            ticket_code: ticket.ticket_code,
            event_id: eventId,
            collaborator_id: collaborator.id,
            action: 'validate',
          }),
        }
      );

      if (response.ok) {
        fetchTickets(); // Refresh list
        if (navigator.vibrate) {
          navigator.vibrate(200);
        }
      }
    } catch (error) {
      console.error('Error validating ticket:', error);
    }
  };

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="font-medium mb-2">Evento não encontrado</h3>
            <Button onClick={() => navigate('/colaborador/dashboard')}>Voltar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderTicketList = (ticketList: Ticket[]) => {
    const filtered = filterTickets(ticketList);

    if (filtered.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <User className="w-12 h-12 mx-auto opacity-50 mb-2" />
          <p>Nenhum participante encontrado</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {filtered.map((ticket, index) => {
          const config = statusConfig[ticket.status as keyof typeof statusConfig] || statusConfig.valid;
          const StatusIcon = config.icon;

          return (
            <motion.div
              key={ticket.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
            >
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">{ticket.holder_name}</h4>
                        <Badge variant="secondary" className={config.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {ticket.holder_email || ticket.holder_phone}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ticket.event_lots?.name} • {ticket.ticket_code.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                    {ticket.status === 'valid' && (
                      <Button
                        size="sm"
                        onClick={() => handleQuickValidate(ticket)}
                      >
                        Validar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 -ml-2 mb-2"
            onClick={() => navigate(`/colaborador/evento/${eventId}`)}
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <h1 className="font-bold">Lista de Participantes</h1>
          <p className="text-sm text-muted-foreground">
            {tickets.length} ingresso(s) • {usedTickets.length} validado(s)
          </p>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou código..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="all">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="all">Todos ({tickets.length})</TabsTrigger>
              <TabsTrigger value="valid">Válidos ({validTickets.length})</TabsTrigger>
              <TabsTrigger value="used">Usados ({usedTickets.length})</TabsTrigger>
              <TabsTrigger value="cancelled">Canc. ({cancelledTickets.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              {renderTicketList(tickets)}
            </TabsContent>
            <TabsContent value="valid" className="mt-4">
              {renderTicketList(validTickets)}
            </TabsContent>
            <TabsContent value="used" className="mt-4">
              {renderTicketList(usedTickets)}
            </TabsContent>
            <TabsContent value="cancelled" className="mt-4">
              {renderTicketList(cancelledTickets)}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
