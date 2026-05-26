import { useState, useEffect, useMemo, useCallback } from 'react';
import { Camera, Search, Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import ColaboradorQRScanner from './ColaboradorQRScanner';
import CheckinResultModal, { CheckinResultData } from './CheckinResultModal';
import { buildWindowMessage } from '@/lib/checkinWindow';

interface TicketRow {
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

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function ColaboradorQRTab({
  eventId,
  collaboratorId,
  sessionToken,
  onSessionExpired,
  onCheckinDone,
}: ColaboradorQRTabProps) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allTickets, setAllTickets] = useState<TicketRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [manualResult, setManualResult] = useState<CheckinResultData | null>(null);

  const loadTickets = useCallback(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collaborator-list-tickets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            event_id: eventId,
            collaborator_id: collaboratorId,
            session_token: sessionToken,
          }),
        }
      );
      const data = await response.json();
      if (data.session_expired) { onSessionExpired(); return; }
      setAllTickets(data.tickets || []);
    } catch {
      toast.error('Erro ao carregar ingressos');
    } finally {
      setIsLoading(false);
    }
  }, [eventId, collaboratorId, sessionToken, onSessionExpired]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const filteredSorted = useMemo(() => {
    const q = normalize(searchQuery.trim());
    const filtered = q
      ? allTickets.filter(t =>
          normalize(t.holder_name).includes(q) ||
          normalize(t.holder_email || '').includes(q) ||
          normalize(t.holder_phone || '').includes(q) ||
          t.ticket_code.toLowerCase().includes(q)
        )
      : allTickets;
    return [...filtered].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'valid' ? -1 : 1;
      if (a.status === 'used') {
        return (b.validated_at || '').localeCompare(a.validated_at || '');
      }
      return a.holder_name.localeCompare(b.holder_name);
    });
  }, [allTickets, searchQuery]);

  const validCount = allTickets.filter(t => t.status === 'valid').length;
  const usedCount = allTickets.filter(t => t.status === 'used').length;

  const handleManualCheckin = async (ticket: TicketRow) => {
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
        setManualResult({
          type: 'success',
          message: 'Pode entrar!',
          holderName: ticket.holder_name,
          lotName: ticket.lot_name,
          ticketCode: ticket.ticket_code,
        });
        if (navigator.vibrate) navigator.vibrate(200);
        setAllTickets(prev =>
          prev.map(t =>
            t.id === ticket.id ? { ...t, status: 'used', validated_at: new Date().toISOString() } : t
          )
        );
        onCheckinDone();
      } else if (data.reason === 'before_window' || data.reason === 'after_window') {
        setManualResult({
          type: 'window_closed',
          message: buildWindowMessage(data.reason, data.starts_at, data.ends_at),
          holderName: ticket.holder_name,
        });
      } else if (data.error?.includes('já foi utilizado')) {
        setManualResult({
          type: 'already_used',
          message: 'Esse ingresso já passou pela portaria.',
          holderName: ticket.holder_name,
          lotName: ticket.lot_name,
        });
        setAllTickets(prev =>
          prev.map(t => t.id === ticket.id ? { ...t, status: 'used' } : t)
        );
      } else {
        setManualResult({
          type: 'error',
          message: data.error || 'Não foi possível validar agora.',
          holderName: ticket.holder_name,
        });
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setValidatingId(null);
    }
  };

  const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    valid: { label: 'Aguardando', color: 'bg-green-500/10 text-green-600', icon: CheckCircle2 },
    used: { label: 'Validado', color: 'bg-slate-500/10 text-slate-600', icon: AlertCircle },
    pending: { label: 'Pendente', color: 'bg-orange-500/10 text-orange-600', icon: AlertCircle },
    cancelled: { label: 'Cancelado', color: 'bg-red-500/10 text-red-600', icon: XCircle },
  };

  return (
    <>
      <div className="space-y-4">
        {/* Big scan button */}
        <button
          onClick={() => setScannerOpen(true)}
          className="group w-full rounded-2xl bg-gradient-to-br from-primary via-primary to-pink-600 text-white p-5 flex items-center gap-4 shadow-lg shadow-primary/25 active:scale-[0.98] hover:shadow-xl hover:shadow-primary/30 transition-all"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0 ring-1 ring-white/30">
            <Camera className="w-8 h-8" strokeWidth={2.2} />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-bold opacity-80">
              Modo portaria
            </p>
            <p className="text-xl font-extrabold leading-tight">Escanear QR Code</p>
            <p className="text-xs opacity-90 mt-0.5">Câmera traseira · validação automática</p>
          </div>
        </button>

        {/* Filter */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">Lista de ingressos</p>
              <p className="text-[11px] text-slate-500">
                {validCount} aguardando · {usedCount} validados
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
              Filtrar
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Nome, código, email ou telefone"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-12 text-base bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white"
              inputMode="search"
              autoComplete="off"
            />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground mt-2">Carregando ingressos...</p>
          </div>
        ) : filteredSorted.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="w-8 h-8 mx-auto opacity-50 mb-2" />
            <p className="text-sm">
              {searchQuery ? 'Nenhum resultado encontrado' : 'Nenhum ingresso vendido ainda'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              {filteredSorted.length} {filteredSorted.length === 1 ? 'ingresso' : 'ingressos'}
            </p>
            {filteredSorted.map((ticket) => {
              const conf = statusConfig[ticket.status] || statusConfig.valid;
              const StatusIcon = conf.icon;
              const isUsed = ticket.status === 'used';
              return (
                <div
                  key={ticket.id}
                  className={`rounded-xl border border-slate-200 shadow-sm p-3 ${
                    isUsed ? 'bg-slate-50 opacity-70' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold truncate text-slate-900">{ticket.holder_name}</h4>
                        <Badge variant="secondary" className={conf.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {conf.label}
                        </Badge>
                      </div>
                      {ticket.holder_email && (
                        <p className="text-sm text-slate-500 truncate">{ticket.holder_email}</p>
                      )}
                      <p className="text-xs text-slate-500 font-mono">
                        {ticket.lot_name && `${ticket.lot_name} • `}
                        {ticket.ticket_code.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                    {ticket.status === 'valid' && (
                      <Button
                        size="sm"
                        className="flex-shrink-0 h-10"
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ColaboradorQRScanner
        open={scannerOpen}
        onClose={() => {
          setScannerOpen(false);
          loadTickets();
          onCheckinDone();
        }}
        eventId={eventId}
        collaboratorId={collaboratorId}
        sessionToken={sessionToken}
        onSessionExpired={onSessionExpired}
        onCheckinDone={() => {
          loadTickets();
          onCheckinDone();
        }}
      />

      <CheckinResultModal
        result={manualResult}
        onClose={() => setManualResult(null)}
      />
    </>
  );
}
