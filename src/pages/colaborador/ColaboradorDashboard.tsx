import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, Clock, LogOut, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useColaboradorAuth } from '@/contexts/ColaboradorAuthContext';

export default function ColaboradorDashboard() {
  const navigate = useNavigate();
  const { collaborator, events, logout } = useColaboradorAuth();

  const handleLogout = () => {
    logout();
    navigate('/colaborador');
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr + 'T12:00:00'), "d 'de' MMM", { locale: ptBR });
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-bold">Olá, {collaborator?.name}</h1>
            <p className="text-sm text-muted-foreground">@{collaborator?.username}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto p-4 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Seus Eventos</h2>

          {events.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-medium mb-2">Nenhum evento disponível</h3>
                <p className="text-sm text-muted-foreground">
                  O produtor ainda não vinculou eventos à sua conta
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {events.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/colaborador/evento/${event.id}`)}
                  >
                    <CardContent className="p-0">
                      <div className="flex gap-4">
                        {event.image_url && (
                          <div className="w-24 h-24 flex-shrink-0">
                            <img
                              src={event.image_url}
                              alt={event.title}
                              className="w-full h-full object-cover rounded-l-lg"
                            />
                          </div>
                        )}
                        <div className="flex-1 py-3 pr-3">
                          <h3 className="font-medium line-clamp-1">{event.title}</h3>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDate(event.date)}</span>
                            <Clock className="w-3.5 h-3.5 ml-2" />
                            <span>{formatTime(event.time)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="line-clamp-1">{event.city}/{event.state}</span>
                          </div>
                        </div>
                        <div className="flex items-center pr-3">
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
