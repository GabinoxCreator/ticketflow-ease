import { useState } from 'react';
import { Search, CheckCircle, XCircle, QrCode, Loader2, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEventParticipants, Ticket } from '@/hooks/useEventParticipants';
import { QRScannerModal } from '@/components/producer/QRScannerModal';
import { exportToCSV } from '@/utils/csvExport';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface EventCheckinTabProps {
  eventId: string;
}

export function EventCheckinTab({ eventId }: EventCheckinTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [validating, setValidating] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const { tickets, validTickets, usedTickets, isLoading, updateTicketStatus } = useEventParticipants(eventId);

  const handleCheckin = async (ticket: Ticket, source: 'manual' | 'qrcode' = 'manual') => {
    if (ticket.status === 'used') {
      toast.error('Ingresso já validado!');
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
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
        onSuccess: async () => {
          setValidating(null);
          toast.success(`Check-in realizado: ${ticket.holder_name}`);
          if (navigator.vibrate) navigator.vibrate(200);

          // Log checkin
          try {
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from('checkin_logs').insert({
              ticket_id: ticket.id,
              event_id: eventId,
              operator_id: user?.id || null,
              action: 'checkin',
              source,
            });
          } catch {}
        },
        onError: () => {
          setValidating(null);
          toast.error('Erro ao validar ingresso');
        },
      }
    );
  };

  const handleQRScan = (code: string) => {
    const ticket = tickets?.find(t => t.ticket_code === code || t.ticket_code.startsWith(code));
    if (ticket) {
      handleCheckin(ticket, 'qrcode');
    } else {
      toast.error('Ingresso não encontrado para este evento');
    }
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

  const handleExportCheckins = () => {
    const validated = tickets?.filter(t => t.status === 'used') || [];
    if (!validated.length) { toast.info('Nenhum check-in para exportar'); return; }
    exportToCSV('checkins.csv',
      ['Nome', 'Email', 'Telefone', 'Código', 'Lote', 'Validado em'],
      validated.map(t => [
        t.holder_name,
        t.holder_email || '',
        t.holder_phone || '',
        t.ticket_code,
        t.lot?.name || '',
        t.validated_at ? new Date(t.validated_at).toLocaleString('pt-BR') : '',
      ])
    );
  };

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

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou código..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 text-lg h-12"
          />
        </div>
        <Button size="lg" className="gap-2" onClick={() => setScannerOpen(true)}>
          <QrCode className="h-5 w-5" />
          Escanear QR
        </Button>
        <Button variant="outline" size="lg" className="gap-2" onClick={handleExportCheckins}>
          <Download className="h-4 w-4" />
          CSV
        </Button>
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
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground font-mono">{ticket.ticket_code.slice(0, 8)}</span>
                      {ticket.lot?.name && (
                        <Badge variant="outline" className="text-xs">{ticket.lot.name}</Badge>
                      )}
                    </div>
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

      <QRScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleQRScan}
      />
    </div>
  );
}
