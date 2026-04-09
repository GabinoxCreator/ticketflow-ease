import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, MapPin, MoreVertical, Edit, Trash2, Eye, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Event } from '@/hooks/useEvents';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface EventListItemProps {
  event: Event;
  onDelete: (id: string) => void;
  onDuplicate?: (event: Event) => void;
}

const statusConfig = {
  draft: { label: 'Rascunho', variant: 'secondary' as const },
  published: { label: 'Publicado', variant: 'default' as const },
  cancelled: { label: 'Cancelado', variant: 'destructive' as const },
  finished: { label: 'Finalizado', variant: 'outline' as const },
};

export function EventListItem({ event, onDelete, onDuplicate }: EventListItemProps) {
  const navigate = useNavigate();
  const status = statusConfig[event.status];

  const eventDate = new Date(event.date + 'T12:00:00');
  const formattedDate = format(eventDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <Card 
      className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate(`/produtor/eventos/${event.id}`)}
    >
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row">
          {/* Image */}
          <div className="relative w-full md:w-48 h-32 md:h-auto flex-shrink-0">
            {event.image_url ? (
              <img
                src={event.image_url}
                alt={event.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <CalendarDays className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            {event.is_hot && (
              <Badge className="absolute top-2 left-2 bg-orange-500">
                🔥 Em Alta
              </Badge>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg truncate">{event.title}</h3>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                  <div className="flex items-center gap-1">
                    <CalendarDays className="w-4 h-4" />
                    <span>{formattedDate}</span>
                    <span className="ml-1">{event.time.slice(0, 5)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span>{event.venue}, {event.city}</span>
                  </div>
                </div>

                {event.short_description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                    {event.short_description}
                  </p>
                )}
              </div>

              {/* Actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="flex-shrink-0">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/evento/${event.id}`)}>
                    <Eye className="w-4 h-4 mr-2" />
                    Visualizar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/produtor/editar-evento/${event.id}`)}>
                    <Edit className="w-4 h-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  {onDuplicate && (
                    <DropdownMenuItem onClick={() => onDuplicate(event)}>
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(event.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
