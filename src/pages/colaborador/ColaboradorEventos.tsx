import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, LogOut, QrCode } from 'lucide-react';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
      return format(parseISO(dateStr), "EEE, d 'de' MMM", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (timeStr: string) => {
    try {
      return timeStr.slice(0, 5);
    } catch {
      return timeStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">Ativo</Badge>;
      case 'draft':
        return <Badge variant="secondary" className="text-xs">Rascunho</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const renderEventList = (eventList: typeof events) => {
    if (eventList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Calendar className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="font-medium text-lg mb-1">Nenhum evento</h3>
          <p className="text-sm text-muted-foreground max-w-[240px]">
            {activeTab === 'proximos'
              ? 'Você não tem eventos próximos vinculados'
              : 'Nenhum evento passado encontrado'}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {eventList.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                {event.image_url && (
                  <div className="w-full h-32 overflow-hidden bg-muted relative">
                    <img
                      src={event.image_url}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2">
                      {getStatusBadge(event.status)}
                    </div>
                  </div>
                )}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-base leading-tight line-clamp-2">{event.title}</h3>
                    {!event.image_url && getStatusBadge(event.status)}
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <span className="flex items-center gap-1.5 text-foreground font-medium">
                      <Calendar className="w-4 h-4 text-primary" />
                      {formatDate(event.date)}
                    </span>
                    <span className="flex items-center gap-1.5 text-foreground font-medium">
                      <Clock className="w-4 h-4 text-primary" />
                      {formatTime(event.time)}
                    </span>
                  </div>

                  <Button
                    className="w-full gap-2 h-12 text-base font-semibold"
                    onClick={() => navigate(`/colaborador/evento/${event.id}`)}
                  >
                    <QrCode className="w-5 h-5" />
                    Fazer Check-in
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Olá,</p>
            <h1 className="text-lg font-bold truncate">{collaborator?.name}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
            <LogOut className="w-4 h-4" />
            <span className="text-xs">Sair</span>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto p-4">
        <h2 className="text-xl font-bold mb-1">Seus eventos</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Toque em um evento para iniciar o check-in.
        </p>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="proximos" className="flex-1">
              Próximos ({upcomingEvents.length})
            </TabsTrigger>
            <TabsTrigger value="passados" className="flex-1">
              Passados ({pastEvents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="proximos">
            {renderEventList(upcomingEvents)}
          </TabsContent>

          <TabsContent value="passados">
            {renderEventList(pastEvents)}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
