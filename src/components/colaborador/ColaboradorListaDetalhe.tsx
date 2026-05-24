import { useState } from 'react';
import { ArrowLeft, Search, CheckCircle2, Clock, Loader2, AlertCircle, User, Calendar, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { buildWindowMessage } from '@/lib/checkinWindow';
import CheckinResultModal, { CheckinResultData } from './CheckinResultModal';

interface GuestEntry {
  id: string;
  name: string;
  status: string;
  checked_in_at: string | null;
  created_at?: string;
  added_by?: string;
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
  const [result, setResult] = useState<CheckinResultData | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<GuestEntry | null>(null);

  const pendingCount = localEntries.filter(e => e.status === 'pending').length;
  const checkedInCount = localEntries.filter(e => e.status === 'checked_in').length;

  const filtered = searchQuery
    ? localEntries.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : localEntries;

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

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
        setSelectedEntry(null);
        setResult({
          type: 'success',
          message: 'Convidado liberado!',
          holderName: entry.name,
          lotName: listName,
        });
        if (navigator.vibrate) navigator.vibrate(200);
        setLocalEntries(prev =>
          prev.map(e =>
            e.id === entry.id
              ? { ...e, status: 'checked_in', checked_in_at: new Date().toISOString() }
              : e
          )
        );
        onCheckinDone();
      } else if (data.reason === 'before_window' || data.reason === 'after_window') {
        setSelectedEntry(null);
        setResult({
          type: 'window_closed',
          message: buildWindowMessage(data.reason, data.starts_at, data.ends_at),
          holderName: entry.name,
        });
      } else if (data.error?.includes('já fez check-in')) {
        setSelectedEntry(null);
        setResult({
          type: 'already_used',
          message: 'Este convidado já entrou.',
          holderName: entry.name,
        });
        setLocalEntries(prev =>
          prev.map(e => e.id === entry.id ? { ...e, status: 'checked_in' } : e)
        );
      } else {
        setSelectedEntry(null);
        setResult({
          type: 'error',
          message: data.error || 'Erro ao registrar entrada',
          holderName: entry.name,
        });
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setValidatingId(null);
    }
  };

  const selectedIsCheckedIn = selectedEntry?.status === 'checked_in';

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

      {/* Aviso de instruções */}
      <div className="flex items-center gap-2 rounded-md border border-amber-100 bg-amber-50/60 px-2.5 py-2 text-xs text-amber-800">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <p>Clique no nome, confira os dados e toque em Confirmar check-in.</p>
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
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedEntry(entry)}
                className="w-full text-left rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-primary/40 hover:shadow-md active:scale-[0.99] transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-slate-900 truncate">{entry.name}</h4>
                      {isCheckedIn ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Entrou
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">
                          <Clock className="w-3 h-3 mr-1" />
                          Pendente
                        </Badge>
                      )}
                    </div>
                    {isCheckedIn && entry.checked_in_at && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Check-in em {formatDate(entry.checked_in_at)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Modal de detalhes */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-md bg-white text-slate-900 border-slate-200">
          {selectedEntry && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl text-slate-900">Detalhes do convidado</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                {/* Nome + status */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 text-lg leading-tight break-words">
                        {selectedEntry.name}
                      </p>
                      <div className="mt-1.5">
                        {selectedIsCheckedIn ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Entrou
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">
                            <Clock className="w-3 h-3 mr-1" /> Pendente
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2.5">
                    <Tag className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-slate-500 text-xs">Lista</p>
                      <p className="text-slate-900 font-medium break-words">{listName}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Calendar className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-slate-500 text-xs">Inscrito em</p>
                      <p className="text-slate-900 font-medium">{formatDate(selectedEntry.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-slate-500 text-xs">Origem</p>
                      <p className="text-slate-900 font-medium">
                        {selectedEntry.added_by === 'public' ? 'Inscrição pelo link público' : 'Adicionado pelo produtor'}
                      </p>
                    </div>
                  </div>
                  {selectedIsCheckedIn && selectedEntry.checked_in_at && (
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-slate-500 text-xs">Check-in em</p>
                        <p className="text-slate-900 font-medium">{formatDate(selectedEntry.checked_in_at)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-col gap-2">
                {selectedIsCheckedIn ? (
                  <>
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 text-center">
                      Convidado já liberado
                    </div>
                    <Button
                      variant="outline"
                      className="w-full border-slate-200 text-slate-700 hover:bg-slate-50"
                      onClick={() => setSelectedEntry(null)}
                    >
                      Fechar
                    </Button>
                  </>
                ) : (
                  <Button
                    size="lg"
                    className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={validatingId === selectedEntry.id}
                    onClick={() => handleEntrada(selectedEntry)}
                  >
                    {validatingId === selectedEntry.id ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Confirmando...</>
                    ) : (
                      <><CheckCircle2 className="w-5 h-5 mr-2" /> Confirmar check-in</>
                    )}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CheckinResultModal result={result} onClose={() => setResult(null)} />
    </div>
  );
}
