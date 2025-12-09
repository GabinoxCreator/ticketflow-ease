import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Search, Gift, CheckCircle2, Clock, XCircle, ListPlus, Ticket } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useColaboradorAuth } from '@/contexts/ColaboradorAuthContext';
import { toast } from 'sonner';

interface TicketGuest {
  type: 'ticket';
  id: string;
  ticket_code: string;
  holder_name: string;
  holder_email: string | null;
  holder_phone: string | null;
  status: string;
  validated_at: string | null;
  created_at: string;
  source: string;
  event_lots: {
    name: string;
    price: number;
  } | null;
}

interface ListGuest {
  type: 'list_entry';
  id: string;
  name: string;
  status: string;
  checked_in_at: string | null;
  created_at: string;
  added_by: string;
  source: string;
  list_name: string;
}

type Guest = TicketGuest | ListGuest;

export default function ColaboradorConvidados() {
  const navigate = useNavigate();
  const { id: eventId } = useParams<{ id: string }>();
  const { events, collaborator } = useColaboradorAuth();

  const [guests, setGuests] = useState<Guest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const event = events.find(e => e.id === eventId);

  useEffect(() => {
    if (eventId) {
      fetchAllGuests();
    }
  }, [eventId]);

  const fetchAllGuests = async () => {
    setIsLoading(true);
    try {
      // Fetch courtesy tickets
      const { data: ticketData, error: ticketError } = await supabase
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
            name,
            price
          )
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (ticketError) throw ticketError;

      // Filter for guests (free tickets or lots with "cortesia"/"convidado" in name)
      const guestTickets: TicketGuest[] = (ticketData || [])
        .filter(t => 
          t.event_lots?.price === 0 || 
          t.event_lots?.name.toLowerCase().includes('cortesia') ||
          t.event_lots?.name.toLowerCase().includes('convidado') ||
          t.event_lots?.name.toLowerCase().includes('grátis') ||
          t.event_lots?.name.toLowerCase().includes('gratis')
        )
        .map(t => ({
          type: 'ticket' as const,
          ...t,
          source: t.event_lots?.name || 'Lote Cortesia',
        }));

      // Fetch guest list entries
      const { data: listData, error: listError } = await supabase
        .from('guest_lists')
        .select(`
          id,
          name,
          guest_list_entries (
            id,
            name,
            status,
            checked_in_at,
            created_at,
            added_by
          )
        `)
        .eq('event_id', eventId);

      if (listError) throw listError;

      // Flatten guest list entries
      const listGuests: ListGuest[] = (listData || []).flatMap(list =>
        (list.guest_list_entries || []).map(entry => ({
          type: 'list_entry' as const,
          id: entry.id,
          name: entry.name,
          status: entry.status === 'checked_in' ? 'used' : entry.status === 'no_show' ? 'cancelled' : 'valid',
          checked_in_at: entry.checked_in_at,
          created_at: entry.created_at,
          added_by: entry.added_by,
          source: list.name,
          list_name: list.name,
        }))
      );

      // Combine and sort by created_at
      const allGuests = [...guestTickets, ...listGuests].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setGuests(allGuests);
    } catch (error) {
      console.error('Error fetching guests:', error);
      toast.error('Erro ao carregar convidados');
    } finally {
      setIsLoading(false);
    }
  };

  const filterGuests = (guestList: Guest[]) => {
    let filtered = guestList;

    // Filter by tab
    if (activeTab === 'tickets') {
      filtered = filtered.filter(g => g.type === 'ticket');
    } else if (activeTab === 'lists') {
      filtered = filtered.filter(g => g.type === 'list_entry');
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(g => {
        const name = g.type === 'ticket' ? g.holder_name : g.name;
        const email = g.type === 'ticket' ? g.holder_email : null;
        const code = g.type === 'ticket' ? g.ticket_code : null;
        
        return (
          name.toLowerCase().includes(query) ||
          email?.toLowerCase().includes(query) ||
          code?.toLowerCase().includes(query) ||
          g.source.toLowerCase().includes(query)
        );
      });
    }

    return filtered;
  };

  const statusConfig = {
    valid: { label: 'Pendente', color: 'bg-yellow-500/10 text-yellow-500', icon: Clock },
    pending: { label: 'Pendente', color: 'bg-yellow-500/10 text-yellow-500', icon: Clock },
    used: { label: 'Check-in', color: 'bg-green-500/10 text-green-500', icon: CheckCircle2 },
    checked_in: { label: 'Check-in', color: 'bg-green-500/10 text-green-500', icon: CheckCircle2 },
    cancelled: { label: 'Cancelado', color: 'bg-destructive/10 text-destructive', icon: XCircle },
    no_show: { label: 'Não compareceu', color: 'bg-destructive/10 text-destructive', icon: XCircle },
  };

  const handleValidate = async (guest: Guest) => {
    if (!collaborator) return;

    try {
      if (guest.type === 'ticket') {
        // Validate ticket
        const response = await supabase.functions.invoke('collaborator-validate-ticket', {
          body: {
            ticket_code: guest.ticket_code,
            event_id: eventId,
            collaborator_id: collaborator.id,
            action: 'validate',
          },
        });

        if (response.error) throw response.error;
        
        // Handle already used ticket gracefully
        if (response.data?.error) {
          if (response.data.error.includes('já foi utilizado') || response.data.error.includes('já fez check-in')) {
            toast.info('Este convidado já fez check-in');
            fetchAllGuests();
            return;
          }
          throw new Error(response.data.error);
        }
      } else {
        // Validate guest list entry
        const response = await supabase.functions.invoke('collaborator-validate-guest-entry', {
          body: {
            entry_id: guest.id,
            event_id: eventId,
            collaborator_id: collaborator.id,
          },
        });
        
        // Handle already checked in gracefully
        if (response.data?.error) {
          if (response.data.error.includes('já fez check-in')) {
            toast.info('Este convidado já fez check-in');
            fetchAllGuests();
            return;
          }
          throw new Error(response.data.error);
        }

        if (response.error) throw response.error;
      }

      toast.success('Check-in realizado!');
      if (navigator.vibrate) navigator.vibrate(200);
      fetchAllGuests();
    } catch (error: any) {
      console.error('Error validating:', error);
      toast.error(error.message || 'Erro ao validar');
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

  const filteredGuests = filterGuests(guests);
  const ticketCount = guests.filter(g => g.type === 'ticket').length;
  const listCount = guests.filter(g => g.type === 'list_entry').length;
  const checkedInCount = guests.filter(g => g.status === 'used' || g.status === 'checked_in').length;

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
          <h1 className="font-bold flex items-center gap-2">
            <Gift className="w-5 h-5" />
            Lista de Convidados
          </h1>
          <p className="text-sm text-muted-foreground">
            {guests.length} convidado(s) • {checkedInCount} check-in(s)
          </p>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">
              Todos ({guests.length})
            </TabsTrigger>
            <TabsTrigger value="tickets" className="flex-1">
              <Ticket className="w-3 h-3 mr-1" />
              Lotes ({ticketCount})
            </TabsTrigger>
            <TabsTrigger value="lists" className="flex-1">
              <ListPlus className="w-3 h-3 mr-1" />
              Listas ({listCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou lista..."
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
        ) : filteredGuests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Gift className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium mb-2">Nenhum convidado encontrado</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery 
                  ? 'Nenhum resultado para sua busca'
                  : 'Não há cortesias cadastradas para este evento'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredGuests.map((guest, index) => {
              const status = guest.status as keyof typeof statusConfig;
              const config = statusConfig[status] || statusConfig.valid;
              const StatusIcon = config.icon;
              const isTicket = guest.type === 'ticket';
              const name = isTicket ? guest.holder_name : guest.name;
              const email = isTicket ? guest.holder_email : null;
              const canValidate = guest.status === 'valid' || guest.status === 'pending';

              return (
                <motion.div
                  key={`${guest.type}-${guest.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                >
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium truncate">{name}</h4>
                            <Badge variant="secondary" className={config.color}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {config.label}
                            </Badge>
                          </div>
                          {email && (
                            <p className="text-sm text-muted-foreground truncate">
                              {email}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {isTicket ? (
                                <><Ticket className="w-3 h-3 mr-1" /> Lote</>
                              ) : (
                                <><ListPlus className="w-3 h-3 mr-1" /> Lista</>
                              )}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {guest.source}
                            </span>
                            {isTicket && (
                              <span className="text-xs text-muted-foreground">
                                • {guest.ticket_code.slice(0, 8).toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                        {canValidate && (
                          <Button
                            size="sm"
                            onClick={() => handleValidate(guest)}
                          >
                            Check-in
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
