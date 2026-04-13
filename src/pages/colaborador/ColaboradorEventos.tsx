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

  const today = startOfDay(new Date());

  const upcomingEvents = events.filter((e) => {
    try {
      return isAfter(parseISO(e.date), today) || parseISO(e.date).getTime() === today.getTime();
    } catch {
      return true;
    }
  });

  const pastEvents = events.filter((e) => {
    try {
      return !isAfter(parseISO(e.date), today) && parseISO(e.date).getTime() !== today.getTime();
    } catch {
      return false;
    }
  });

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
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {event.image_url && (
                  <div className="w-full h-36 overflow-hidden">
                    <img
                      src={event.image_url}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-base line-clamp-2">{event.title}</h3>
                    {getStatusBadge(event.status)}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {formatDate(event.date)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      {formatTime(event.time)}
                    </span>
                  </div>

                  <Button
                    className="w-full gap-2 h-12 text-base"
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Eventos</h1>
            <p className="text-sm text-muted-foreground">
              Olá, {collaborator?.name}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto p-4">
        <p className="text-sm text-muted-foreground mb-4">
          Selecione um evento para operar o check-in
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
