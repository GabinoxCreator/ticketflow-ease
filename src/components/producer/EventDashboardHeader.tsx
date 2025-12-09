import { ArrowLeft, Calendar, MapPin, Edit, ExternalLink, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { Event } from '@/hooks/useEvents';
import { format, differenceInDays, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EventDashboardHeaderProps {
  event: Event;
  totalRevenue: number;
  ticketsSold: number;
}

export function EventDashboardHeader({ event, totalRevenue, ticketsSold }: EventDashboardHeaderProps) {
  const navigate = useNavigate();
  
  const eventDate = new Date(event.date);
  const daysUntil = differenceInDays(eventDate, new Date());
  const isEventPast = isPast(eventDate);

  const getStatusBadge = () => {
    if (event.status === 'cancelled') {
      return <Badge variant="destructive">Cancelado</Badge>;
    }
    if (event.status === 'draft') {
      return <Badge variant="secondary">Rascunho</Badge>;
    }
    if (isEventPast) {
      return <Badge variant="outline">Encerrado</Badge>;
    }
    if (daysUntil <= 7) {
      return <Badge className="bg-orange-500 hover:bg-orange-600">{daysUntil} dias</Badge>;
    }
    return <Badge className="bg-green-500 hover:bg-green-600">Ativo</Badge>;
  };

  return (
    <div className="mb-6">
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => navigate('/dashboard/eventos')}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar para Eventos
      </Button>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Event Image */}
          <div className="w-full md:w-48 h-32 md:h-auto flex-shrink-0">
            {event.image_url ? (
              <img 
                src={event.image_url} 
                alt={event.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Event Info */}
          <div className="flex-1 p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {getStatusBadge()}
                  {event.is_hot && (
                    <Badge variant="outline" className="text-orange-500 border-orange-500">
                      🔥 Em Alta
                    </Badge>
                  )}
                </div>
                
                <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
                
                <div className="flex flex-wrap gap-4 text-muted-foreground text-sm">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {format(eventDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {event.time}
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {event.venue}, {event.city}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate(`/editar-evento/${event.id}`)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.open(`/evento/${event.id}`, '_blank')}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver Página
                </Button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex flex-wrap gap-6 mt-4 pt-4 border-t">
              <div>
                <p className="text-2xl font-bold text-primary">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue)}
                </p>
                <p className="text-xs text-muted-foreground">Receita Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{ticketsSold}</p>
                <p className="text-xs text-muted-foreground">Ingressos Vendidos</p>
              </div>
              {!isEventPast && daysUntil >= 0 && (
                <div>
                  <p className="text-2xl font-bold">{daysUntil}</p>
                  <p className="text-xs text-muted-foreground">Dias Restantes</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
