import { ArrowLeft, Calendar, MapPin, Edit, ExternalLink, Clock, Globe, EyeOff, CalendarClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Event } from '@/hooks/useEvents';
import { usePublishEvent, useUnpublishEvent } from '@/hooks/useEventPublishing';
import { format, differenceInDays, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ManualSaleButton } from '@/components/producer/ManualSaleButton';
import { CourtesyTicketsButton } from '@/components/producer/admin/CourtesyTicketsButton';
import { TirarDoArDialog } from '@/components/producer/TirarDoArDialog';

interface EventDashboardHeaderProps {
  event: Event;
}

/**
 * Topo do evento. OS-408 etapa 5 (5.7): capa menor e SEM os números (Vendido, ingressos
 * vendidos), que já estão na Visão Geral logo abaixo: assim as abas aparecem sem rolar no
 * notebook. Os dias que faltam ficam numa linha da informação do evento.
 */
export function EventDashboardHeader({ event }: EventDashboardHeaderProps) {
  const navigate = useNavigate();
  const publishEvent = usePublishEvent();
  const unpublishEvent = useUnpublishEvent();
  // Despublicar para a venda: pergunta antes (OS-408). "Voltar" não grava nada.
  const [perguntaTirarDoAr, setPerguntaTirarDoAr] = useState(false);

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
    return <Badge className="bg-gradient-to-r from-primary to-pink-500 text-white border-none shadow-lg shadow-primary/20">Publicado</Badge>;
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
              disabled={publishEvent.isPending}
              onClick={() => publishEvent.mutate(event.id)}
              className="rounded-xl bg-gradient-to-r from-primary to-pink-500 hover:opacity-90 text-white shadow-lg shadow-primary/20"
            >
              {publishEvent.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
              Publicar Evento
            </Button>
          )}
          {event.status === 'published' && (
            <Button
              variant="outline"
              size="sm"
              disabled={unpublishEvent.isPending}
              onClick={() => setPerguntaTirarDoAr(true)}
              className="rounded-xl bg-card/40 backdrop-blur-xl border-primary/10 hover:bg-card/60"
            >
              {unpublishEvent.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <EyeOff className="h-4 w-4 mr-2" />}
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
            onClick={() => window.open(`/evento/${event.slug ?? event.id}`, '_blank')}
            className="rounded-xl bg-card/40 backdrop-blur-xl border-primary/10 hover:bg-card/60"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Ver Página
          </Button>
          <ManualSaleButton event={event} label="+ Venda Manual" />
          <ManualSaleButton event={event} courtesy variant="outline" label="Gerar Cortesia" />
          <CourtesyTicketsButton event={event} />
        </div>
      </div>

      {/* Premium glass hero */}
      <div className="relative rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-xl overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <div className="flex flex-col sm:flex-row">
          {/* Capa: menor (OS-408 etapa 5): no celular uma faixa baixa, no computador um quadro ao lado. */}
          <div className="relative w-full h-28 sm:w-40 sm:h-auto md:w-48 flex-shrink-0">
            {event.image_url ? (
              <>
                <img
                  src={event.image_url}
                  alt={event.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-card/80 via-card/20 to-transparent" />
              </>
            ) : (
              <div className="w-full h-full bg-muted/30 flex items-center justify-center min-h-[7rem]">
                <Calendar className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Event Info */}
          <div className="flex-1 p-4 md:p-5 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {getStatusBadge()}
            </div>

            <h1 className="text-xl md:text-2xl font-bold mb-2 break-words">{event.title}</h1>

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
              {!isEventPast && daysUntil > 7 && (
                <div className="flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4 text-amber-400" />
                  {daysUntil} dias restantes
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <TirarDoArDialog
        open={perguntaTirarDoAr}
        onOpenChange={setPerguntaTirarDoAr}
        onConfirm={() => unpublishEvent.mutate(event.id)}
      />
    </div>
  );
}
