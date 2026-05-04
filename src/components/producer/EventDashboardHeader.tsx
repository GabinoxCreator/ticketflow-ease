import { ArrowLeft, Calendar, MapPin, Edit, ExternalLink, Clock, Globe, EyeOff, DollarSign, Ticket as TicketIcon, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { Event, useEvents } from '@/hooks/useEvents';
import { format, differenceInDays, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EventDashboardHeaderProps {
  event: Event;
  totalRevenue: number;
  ticketsSold: number;
}

export function EventDashboardHeader({ event, totalRevenue, ticketsSold }: EventDashboardHeaderProps) {
  const navigate = useNavigate();
  const { updateEvent } = useEvents();

  const eventDate = new Date(event.date + 'T12:00:00');
  const daysUntil = differenceInDays(eventDate, new Date());
  const eventEndDate = (() => {
    if (event.end_date) {
      const t = event.end_time ? event.end_time.slice(0, 8) : '23:59:00';
      return new Date(`${event.end_date}T${t}`);
    }
    const startTime = event.time ? event.time.slice(0, 8) : '00:00:00';
    return new Date(new Date(`${event.date}T${startTime}`).getTime() + 6 * 60 * 60 * 1000);
  })();
  const isEventPast = eventEndDate < new Date();

  const getStatusBadge = () => {
    if (event.status === 'cancelled') {
      return <Badge className="bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/20">Cancelado</Badge>;
    }
    if (event.status === 'draft') {
      return <Badge className="bg-muted/40 text-muted-foreground border border-border/40">Rascunho</Badge>;
    }
    if (isEventPast) {
      return <Badge className="bg-muted/40 text-muted-foreground border border-border/40">Encerrado</Badge>;
    }
    if (daysUntil <= 7) {
      return <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20">{daysUntil} {daysUntil === 1 ? 'dia' : 'dias'}</Badge>;
    }
    return <Badge className="bg-gradient-to-r from-primary to-pink-500 text-white border-none shadow-lg shadow-primary/20">Ativo</Badge>;
  };

  return (
    <div className="mb-6">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/produtor/eventos')}
          className="rounded-xl"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Eventos
        </Button>

        <div className="flex gap-2 flex-wrap">
          {event.status === 'draft' && (
            <Button
              size="sm"
              onClick={() => updateEvent.mutate({ id: event.id, data: { status: 'published' } })}
              className="rounded-xl bg-gradient-to-r from-primary to-pink-500 hover:opacity-90 text-white shadow-lg shadow-primary/20"
            >
              <Globe className="h-4 w-4 mr-2" />
              Publicar Evento
            </Button>
          )}
          {event.status === 'published' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateEvent.mutate({ id: event.id, data: { status: 'draft' } })}
              className="rounded-xl bg-card/40 backdrop-blur-xl border-primary/10 hover:bg-card/60"
            >
              <EyeOff className="h-4 w-4 mr-2" />
              Despublicar
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/produtor/editar-evento/${event.id}`)}
            className="rounded-xl bg-card/40 backdrop-blur-xl border-primary/10 hover:bg-card/60"
          >
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/evento/${event.id}`, '_blank')}
            className="rounded-xl bg-card/40 backdrop-blur-xl border-primary/10 hover:bg-card/60"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Ver Página
          </Button>
        </div>
      </div>

      {/* Premium glass hero */}
      <div className="relative rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-xl overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <div className="flex flex-col md:flex-row">
          {/* Event Image */}
          <div className="relative w-full h-52 md:w-72 md:h-auto md:min-h-[18rem] flex-shrink-0">
            {event.image_url ? (
              <>
                <img
                  src={event.image_url}
                  alt={event.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-card/80 via-card/20 to-transparent" />
              </>
            ) : (
              <div className="w-full h-full bg-muted/30 flex items-center justify-center min-h-[12rem]">
                <Calendar className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Event Info */}
          <div className="flex-1 p-5 md:p-6 min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {getStatusBadge()}
              {event.is_hot && (
                <Badge className="bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  🔥 Em Alta
                </Badge>
              )}
            </div>

            <h1 className="text-2xl md:text-3xl font-bold mb-3 break-words">{event.title}</h1>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground text-sm">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                {format(eventDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                {event.time?.slice(0, 5)}
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="truncate">{event.venue}, {event.city}</span>
              </div>
            </div>

            {/* Quick Stats — glass mini-cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
              <div className="rounded-xl border border-primary/10 bg-background/40 p-3 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-pink-500/20">
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent truncate">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Receita Total</p>
                </div>
              </div>

              <div className="rounded-xl border border-primary/10 bg-background/40 p-3 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/15">
                  <TicketIcon className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{ticketsSold}</p>
                  <p className="text-[11px] text-muted-foreground">Vendidos</p>
                </div>
              </div>

              {!isEventPast && daysUntil >= 0 && (
                <div className="rounded-xl border border-primary/10 bg-background/40 p-3 flex items-center gap-3 col-span-2 sm:col-span-1">
                  <div className="p-2 rounded-lg bg-amber-500/15">
                    <CalendarClock className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{daysUntil}</p>
                    <p className="text-[11px] text-muted-foreground">Dias Restantes</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
