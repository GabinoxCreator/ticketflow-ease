import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, Users, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useColaboradorAuth } from '@/contexts/ColaboradorAuthContext';
import ColaboradorBottomNav from '@/components/colaborador/ColaboradorBottomNav';
import ColaboradorQRTab from '@/components/colaborador/ColaboradorQRTab';
import ColaboradorListasTab from '@/components/colaborador/ColaboradorListasTab';

export default function ColaboradorEvento() {
  const navigate = useNavigate();
  const { id: eventId } = useParams<{ id: string }>();
  const { collaborator, events, session, logout } = useColaboradorAuth();
  const [activeTab, setActiveTab] = useState<'qr' | 'listas'>('qr');
  const [stats, setStats] = useState({ checkins: 0, pending: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const event = events.find(e => e.id === eventId);

  const fetchStats = async () => {
    if (!eventId) return;
    setRefreshing(true);
    try {
      const { data: tickets } = await supabase
        .from('tickets')
        .select('status')
        .eq('event_id', eventId)
        .in('status', ['valid', 'used']);

      const ticketCheckins = tickets?.filter(t => t.status === 'used').length || 0;
      const ticketPending = tickets?.filter(t => t.status === 'valid').length || 0;

      const { data: lists } = await supabase
        .from('guest_lists')
        .select('guest_list_entries(status)')
        .eq('event_id', eventId)
        .eq('is_active', true);

      let guestCheckins = 0;
      let guestPending = 0;
      lists?.forEach((list: any) => {
        list.guest_list_entries?.forEach((e: any) => {
          if (e.status === 'checked_in') guestCheckins++;
          else if (e.status === 'pending') guestPending++;
        });
      });

      setStats({
        checkins: ticketCheckins + guestCheckins,
        pending: ticketPending + guestPending,
        total: (tickets?.length || 0) + guestCheckins + guestPending,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setTimeout(() => setRefreshing(false), 300);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [eventId]);

  const handleSessionExpired = () => {
    logout();
    navigate('/colaborador');
  };

  if (!event || !collaborator || !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="font-medium mb-2">Evento não encontrado</h3>
            <Button onClick={() => navigate('/colaborador/eventos')}>Voltar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formattedDate = new Date(event.date + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });

  const progress = stats.total > 0 ? Math.round((stats.checkins / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-3 py-2.5 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-slate-600"
            onClick={() => navigate('/colaborador/eventos')}
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-[15px] leading-tight text-slate-900 truncate">{event.title}</h1>
            <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
              {formattedDate} · {event.time?.slice(0, 5)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-slate-500"
            onClick={fetchStats}
            aria-label="Atualizar"
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-lg mx-auto px-4 py-3 space-y-3">
        {/* Progress bar */}
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
              Progresso
            </span>
            <span className="text-sm font-bold text-slate-900">
              {stats.checkins}<span className="text-slate-400 font-medium">/{stats.total}</span>
              <span className="ml-2 text-emerald-600">{progress}%</span>
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-2xl font-extrabold text-emerald-700 leading-none tabular-nums">
              {stats.checkins}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-emerald-700/80 mt-1 font-bold">
              Entraram
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <Clock className="w-5 h-5 mx-auto text-amber-600 mb-1" />
            <p className="text-2xl font-extrabold text-amber-700 leading-none tabular-nums">
              {stats.pending}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-amber-700/80 mt-1 font-bold">
              Aguardando
            </p>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
            <Users className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-extrabold text-primary leading-none tabular-nums">
              {stats.total}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-primary/80 mt-1 font-bold">
              Total
            </p>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-lg mx-auto px-4 py-2">
        {activeTab === 'qr' ? (
          <ColaboradorQRTab
            eventId={eventId!}
            collaboratorId={collaborator.id}
            sessionToken={session.token}
            onSessionExpired={handleSessionExpired}
            onCheckinDone={fetchStats}
          />
        ) : (
          <ColaboradorListasTab
            eventId={eventId!}
            collaboratorId={collaborator.id}
            sessionToken={session.token}
            onSessionExpired={handleSessionExpired}
            onCheckinDone={fetchStats}
          />
        )}
      </div>

      <ColaboradorBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
