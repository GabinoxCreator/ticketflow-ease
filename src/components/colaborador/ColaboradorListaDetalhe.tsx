import { useState } from 'react';
import { ArrowLeft, Search, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { buildWindowMessage } from '@/lib/checkinWindow';

interface GuestEntry {
  id: string;
  name: string;
  status: string;
  checked_in_at: string | null;
}

interface ColaboradorListaDetalheProps {
  listName: string;
  entries: GuestEntry[];
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onBack: () => void;
  onSessionExpired: () => void;
  onCheckinDone: () => void;
}

export default function ColaboradorListaDetalhe({
  listName,
  entries,
  eventId,
  collaboratorId,
  sessionToken,
  onBack,
  onSessionExpired,
  onCheckinDone,
}: ColaboradorListaDetalheProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState(entries);

  const pendingCount = localEntries.filter(e => e.status === 'pending').length;
  const checkedInCount = localEntries.filter(e => e.status === 'checked_in').length;

  const filtered = searchQuery
    ? localEntries.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : localEntries;

  const handleEntrada = async (entry: GuestEntry) => {
    if (entry.status === 'checked_in') return;
    setValidatingId(entry.id);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collaborator-validate-guest-entry`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            entry_id: entry.id,
            event_id: eventId,
            collaborator_id: collaboratorId,
            session_token: sessionToken,
            source: 'lista',
          }),
        }
      );

      const data = await response.json();
      if (data.session_expired) { onSessionExpired(); return; }

      if (data.success) {
        toast.success(`Entrada: ${entry.name}`);
        if (navigator.vibrate) navigator.vibrate(200);
        setLocalEntries(prev =>
          prev.map(e =>
            e.id === entry.id
              ? { ...e, status: 'checked_in', checked_in_at: new Date().toISOString() }
              : e
          )
        );
        onCheckinDone();
      } else {
        if (data.reason === 'before_window' || data.reason === 'after_window') {
          toast.error(buildWindowMessage(data.reason, data.starts_at, data.ends_at));
        } else if (data.error?.includes('já fez check-in')) {
          toast.info('Convidado já fez check-in');
          setLocalEntries(prev =>
            prev.map(e => e.id === entry.id ? { ...e, status: 'checked_in' } : e)
          );
        } else {
          toast.error(data.error || 'Erro ao registrar entrada');
        }
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setValidatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h3 className="font-bold">{listName}</h3>
          <p className="text-sm text-muted-foreground">
            {pendingCount} pendente(s) • {checkedInCount} check-in(s)
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Nenhum convidado encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const isCheckedIn = entry.status === 'checked_in';
            return (
              <Card key={entry.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">{entry.name}</h4>
                        {isCheckedIn ? (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Entrou
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">
                            <Clock className="w-3 h-3 mr-1" />
                            Pendente
                          </Badge>
                        )}
                      </div>
                      {isCheckedIn && entry.checked_in_at && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.checked_in_at).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                    {!isCheckedIn && (
                      <Button
                        size="sm"
                        className="flex-shrink-0"
                        disabled={validatingId === entry.id}
                        onClick={() => handleEntrada(entry)}
                      >
                        {validatingId === entry.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Entrada'
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
    </div>
  );
}
