import { useState } from 'react';
import { Camera, Search, Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import ColaboradorQRScanner from './ColaboradorQRScanner';

interface SearchResult {
  id: string;
  ticket_code: string;
  holder_name: string;
  holder_email?: string;
  holder_phone?: string;
  status: string;
  validated_at?: string;
  lot_name?: string;
}

interface ColaboradorQRTabProps {
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
  onCheckinDone: () => void;
}

export default function ColaboradorQRTab({
  eventId,
  collaboratorId,
  sessionToken,
  onSessionExpired,
  onCheckinDone,
}: ColaboradorQRTabProps) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    setSearchResults([]);

    try {
      // If looks like a ticket code (alphanumeric, short), search by code
      const isCode = /^[a-f0-9-]{6,}$/i.test(query);

      if (isCode) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collaborator-validate-ticket`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              ticket_code: query,
              event_id: eventId,
              collaborator_id: collaboratorId,
              session_token: sessionToken,
              action: 'check',
            }),
          }
        );
        const data = await response.json();
        if (data.session_expired) { onSessionExpired(); return; }
        if (data.ticket) {
          setSearchResults([data.ticket]);
        } else {
          setSearchResults([]);
        }
      } else {
        // Search by name/email/phone
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collaborator-search-tickets`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              query,
              event_id: eventId,
              collaborator_id: collaboratorId,
              session_token: sessionToken,
            }),
          }
        );
        const data = await response.json();
        if (data.session_expired) { onSessionExpired(); return; }
        setSearchResults(data.tickets || []);
      }
    } catch {
      toast.error('Erro ao buscar');
    } finally {
      setIsSearching(false);
    }
  };

  const handleManualCheckin = async (ticket: SearchResult) => {
    if (ticket.status !== 'valid') return;
    setValidatingId(ticket.id);

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
            collaborator_id: collaboratorId,
            session_token: sessionToken,
            action: 'validate',
            source: 'busca_manual',
          }),
        }
      );

      const data = await response.json();
      if (data.session_expired) { onSessionExpired(); return; }

      if (data.success) {
        toast.success(`Check-in: ${ticket.holder_name}`);
        if (navigator.vibrate) navigator.vibrate(200);
        // Update local state
        setSearchResults(prev =>
          prev.map(t =>
            t.id === ticket.id ? { ...t, status: 'used', validated_at: new Date().toISOString() } : t
          )
        );
        onCheckinDone();
      } else {
        toast.error(data.error || 'Erro ao validar');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setValidatingId(null);
    }
  };

  const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    valid: { label: 'Válido', color: 'bg-green-500/10 text-green-600', icon: CheckCircle2 },
    used: { label: 'Utilizado', color: 'bg-yellow-500/10 text-yellow-600', icon: AlertCircle },
    pending: { label: 'Pendente', color: 'bg-orange-500/10 text-orange-600', icon: AlertCircle },
    cancelled: { label: 'Cancelado', color: 'bg-red-500/10 text-red-600', icon: XCircle },
  };

  return (
    <>
      <div className="space-y-4">
        {/* Big scan button */}
        <Button
          size="lg"
          className="w-full h-16 text-lg gap-3"
          onClick={() => setScannerOpen(true)}
        >
          <Camera className="w-6 h-6" />
          Escanear QR Code
        </Button>

        {/* Manual search */}
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSearch} className="space-y-3">
              <p className="text-sm font-medium">Busca manual</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Nome, código, email ou telefone"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button type="submit" disabled={isSearching || !searchQuery.trim()}>
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {searchResults.length} resultado(s)
            </p>
            {searchResults.map((ticket) => {
              const config = statusConfig[ticket.status] || statusConfig.valid;
              const StatusIcon = config.icon;
              return (
                <Card key={ticket.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium truncate">{ticket.holder_name}</h4>
                          <Badge variant="secondary" className={config.color}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {config.label}
                          </Badge>
                        </div>
                        {ticket.holder_email && (
                          <p className="text-sm text-muted-foreground truncate">{ticket.holder_email}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {ticket.lot_name && `${ticket.lot_name} • `}
                          {ticket.ticket_code.slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                      {ticket.status === 'valid' && (
                        <Button
                          size="sm"
                          className="flex-shrink-0"
                          disabled={validatingId === ticket.id}
                          onClick={() => handleManualCheckin(ticket)}
                        >
                          {validatingId === ticket.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Check-in'
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {isSearching && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground mt-2">Buscando...</p>
          </div>
        )}

        {!isSearching && searchResults.length === 0 && searchQuery && (
          <div className="text-center py-6 text-muted-foreground">
            <Search className="w-8 h-8 mx-auto opacity-50 mb-2" />
            <p className="text-sm">Nenhum resultado encontrado</p>
          </div>
        )}
      </div>

      <ColaboradorQRScanner
        open={scannerOpen}
        onClose={() => {
          setScannerOpen(false);
          onCheckinDone();
        }}
        eventId={eventId}
        collaboratorId={collaboratorId}
        sessionToken={sessionToken}
        onSessionExpired={onSessionExpired}
      />
    </>
  );
}
