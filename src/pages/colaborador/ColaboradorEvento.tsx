import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

  const event = events.find(e => e.id === eventId);

  const fetchStats = async () => {
    if (!eventId) return;
    try {
      // Fetch ticket stats
      const { data: tickets } = await supabase
        .from('tickets')
        .select('status')
        .eq('event_id', eventId)
        .in('status', ['valid', 'used']);

      const ticketCheckins = tickets?.filter(t => t.status === 'used').length || 0;
      const ticketPending = tickets?.filter(t => t.status === 'valid').length || 0;

      // Fetch guest list stats
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="font-medium mb-2">Evento não encontrado</h3>
            <Button onClick={() => navigate('/colaborador/eventos')}>Voltar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formattedDate = new Date(event.date + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 -ml-2 mb-1 h-8"
            onClick={() => navigate('/colaborador/eventos')}
          >
            <ArrowLeft className="w-4 h-4" />
            Eventos
          </Button>
          <h1 className="font-bold text-lg leading-tight line-clamp-1">{event.title}</h1>
          <p className="text-xs text-muted-foreground">
            {formattedDate} · {event.time?.slice(0, 5)}
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-lg mx-auto px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          <Card className="border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30">
            <CardContent className="p-3 text-center">
              <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-600 dark:text-emerald-400 mb-1" />
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 leading-none">{stats.checkins}</p>
              <p className="text-[10px] uppercase tracking-wide text-emerald-700/70 dark:text-emerald-400/70 mt-1 font-semibold">Check-ins</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="p-3 text-center">
              <Clock className="w-5 h-5 mx-auto text-amber-600 dark:text-amber-400 mb-1" />
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 leading-none">{stats.pending}</p>
              <p className="text-[10px] uppercase tracking-wide text-amber-700/70 dark:text-amber-400/70 mt-1 font-semibold">Pendentes</p>
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3 text-center">
              <Users className="w-5 h-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-primary leading-none">{stats.total}</p>
              <p className="text-[10px] uppercase tracking-wide text-primary/70 mt-1 font-semibold">Total</p>
            </CardContent>
          </Card>
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
