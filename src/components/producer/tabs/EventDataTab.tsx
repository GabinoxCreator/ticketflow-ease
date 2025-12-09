import { Calendar, Clock, MapPin, Tag, FileText, Image as ImageIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Event } from '@/hooks/useEvents';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface EventDataTabProps {
  event: Event;
}

export function EventDataTab({ event }: EventDataTabProps) {
  const navigate = useNavigate();

  const infoItems = [
    {
      icon: Calendar,
      label: 'Data',
      value: format(new Date(event.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
    },
    {
      icon: Clock,
      label: 'Horário',
      value: event.time,
    },
    {
      icon: MapPin,
      label: 'Local',
      value: `${event.venue}`,
    },
    {
      icon: MapPin,
      label: 'Endereço',
      value: event.address || 'Não informado',
    },
    {
      icon: MapPin,
      label: 'Cidade/Estado',
      value: `${event.city}, ${event.state}`,
    },
    {
      icon: Tag,
      label: 'Categoria',
      value: event.category,
    },
  ];

  const getStatusLabel = () => {
    switch (event.status) {
      case 'published':
        return { label: 'Publicado', variant: 'default' as const };
      case 'draft':
        return { label: 'Rascunho', variant: 'secondary' as const };
      case 'cancelled':
        return { label: 'Cancelado', variant: 'destructive' as const };
      case 'finished':
        return { label: 'Encerrado', variant: 'outline' as const };
      default:
        return { label: event.status, variant: 'outline' as const };
    }
  };

  const status = getStatusLabel();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Event Image */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Imagem do Evento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {event.image_url ? (
            <img 
              src={event.image_url} 
              alt={event.title}
              className="w-full rounded-lg object-cover aspect-video"
            />
          ) : (
            <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Informações
          </CardTitle>
          <Badge variant={status.variant}>{status.label}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {infoItems.map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <item.icon className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="font-medium">{item.value}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Description */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Descrição</CardTitle>
        </CardHeader>
        <CardContent>
          {event.short_description && (
            <p className="text-muted-foreground mb-4">{event.short_description}</p>
          )}
          {event.description ? (
            <p className="whitespace-pre-wrap">{event.description}</p>
          ) : (
            <p className="text-muted-foreground italic">Nenhuma descrição adicionada.</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card className="md:col-span-2">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate(`/editar-evento/${event.id}`)}>
              Editar Evento
            </Button>
            <Button variant="outline" onClick={() => window.open(`/evento/${event.id}`, '_blank')}>
              Ver Página Pública
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
