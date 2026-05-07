import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, LogOut, QrCode, MapPin, ChevronRight, ScanLine } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useColaboradorAuth } from '@/contexts/ColaboradorAuthContext';

export default function ColaboradorEventos() {
  const navigate = useNavigate();
  const { collaborator, events, logout } = useColaboradorAuth();
  const [activeTab, setActiveTab] = useState('proximos');

  const handleLogout = () => {
    logout();
    navigate('/colaborador');
  };

  const now = new Date();

  const getEventEnd = (e: any): Date => {
    if (e.end_date) {
      const t = e.end_time ? e.end_time.slice(0, 8) : '23:59:00';
      return new Date(`${e.end_date}T${t}`);
    }
    const st = e.time ? e.time.slice(0, 8) : '00:00:00';
    return new Date(new Date(`${e.date}T${st}`).getTime() + 6 * 60 * 60 * 1000);
  };

  const upcomingEvents = events.filter((e) => getEventEnd(e) >= now);
  const pastEvents = events.filter((e) => getEventEnd(e) < now);

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr + 'T12:00:00'), "EEE, d 'de' MMM", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (timeStr: string) => timeStr?.slice(0, 5) || '';

  const isLive = (e: any) => {
    const start = new Date(`${e.date}T${e.time?.slice(0, 8) || '00:00:00'}`);
    return start <= now && getEventEnd(e) >= now;
  };

  const initials = (collaborator?.name || 'C')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const renderEventList = (eventList: typeof events, mode: 'upcoming' | 'past') => {
    if (eventList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-white rounded-2xl border border-slate-200">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Calendar className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="font-semibold text-base text-slate-900 mb-1">
            {mode === 'upcoming' ? 'Nenhum evento agora' : 'Nenhum evento passado'}
          </h3>
          <p className="text-sm text-slate-500 max-w-[260px]">
            {mode === 'upcoming'
              ? 'Quando o produtor te vincular a um evento, ele aparece aqui.'
              : 'Eventos finalizados ficarão registrados aqui.'}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {eventList.map((event, index) => {
          const live = mode === 'upcoming' && isLive(event);
          return (
            <motion.button
              key={event.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              onClick={() => navigate(`/colaborador/evento/${event.id}`)}
              className="w-full text-left bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md hover:border-primary/40 active:scale-[0.99] transition-all"
            >
              <div className="flex items-stretch gap-0">
                {/* Cover */}
                <div className="w-24 sm:w-28 shrink-0 bg-slate-100 relative">
                  {event.image_url ? (
                    <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Calendar className="w-7 h-7 text-slate-300" />
                    </div>
                  )}
                  {live && (
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide shadow">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      Ao vivo
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 p-3.5 flex flex-col justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold text-[15px] leading-tight text-slate-900 line-clamp-2 mb-1.5">
                      {event.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-600 mb-1">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                        {formatDate(event.date)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        {formatTime(event.time)}
                      </span>
                    </div>
                    {event.venue && (
                      <p className="text-xs text-slate-500 truncate inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {event.venue}
                      </p>
                    )}
                  </div>

                  {mode === 'upcoming' && (
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-[11px] uppercase font-bold tracking-wider text-primary inline-flex items-center gap-1">
                        <ScanLine className="w-3.5 h-3.5" />
                        Operar check-in
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  {mode === 'past' && (
                    <Badge variant="secondary" className="mt-2.5 self-start text-[10px] bg-slate-100 text-slate-500">
                      Encerrado
                    </Badge>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold leading-none">
                Colaborador
              </p>
              <h1 className="text-[15px] font-bold text-slate-900 truncate leading-tight mt-0.5">
                {collaborator?.name}
              </h1>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-xs font-semibold">Sair</span>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto p-4">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">Seus eventos</h2>
          <p className="text-sm text-slate-500">Toque em um evento para iniciar o check-in.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-4 bg-slate-100 p-1 h-11">
            <TabsTrigger
              value="proximos"
              className="flex-1 h-9 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm font-semibold"
            >
              Próximos ({upcomingEvents.length})
            </TabsTrigger>
            <TabsTrigger
              value="passados"
              className="flex-1 h-9 data-[state=active]:bg-white data-[state=active]:text-slate-700 data-[state=active]:shadow-sm font-semibold"
            >
              Passados ({pastEvents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="proximos" className="mt-0">
            {renderEventList(upcomingEvents, 'upcoming')}
          </TabsContent>
          <TabsContent value="passados" className="mt-0">
            {renderEventList(pastEvents, 'past')}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
