import { MoreHorizontal, Mail, Phone, QrCode, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Ticket } from '@/hooks/useEventParticipants';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ParticipantListItemProps {
  ticket: Ticket;
  onUpdateStatus: (ticketId: string, status: Ticket['status']) => void;
}

export function ParticipantListItem({ ticket, onUpdateStatus }: ParticipantListItemProps) {
  const getStatusBadge = () => {
    switch (ticket.status) {
      case 'valid':
        return (
          <Badge className="bg-blue-500 hover:bg-blue-600">
            <Clock className="h-3 w-3 mr-1" />
            Não Validado
          </Badge>
        );
      case 'used':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Validado
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Cancelado
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-card/80 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h4 className="font-medium">{ticket.holder_name}</h4>
          {getStatusBadge()}
        </div>
        
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {ticket.holder_email && (
            <div className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {ticket.holder_email}
            </div>
          )}
          {ticket.holder_phone && (
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {ticket.holder_phone}
            </div>
          )}
          <div className="flex items-center gap-1">
            <QrCode className="h-3 w-3" />
            <code className="text-xs bg-muted px-1 rounded">{ticket.ticket_code.slice(0, 8)}...</code>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-medium">{ticket.lot?.name || 'Lote'}</p>
          {ticket.lot?.price && (
            <p className="text-sm text-muted-foreground">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(ticket.lot.price))}
            </p>
          )}
          {ticket.validated_at && (
            <p className="text-xs text-muted-foreground">
              Validado em {format(new Date(ticket.validated_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ticket.status === 'valid' && (
              <DropdownMenuItem onClick={() => onUpdateStatus(ticket.id, 'used')}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Marcar como Validado
              </DropdownMenuItem>
            )}
            {ticket.status === 'used' && (
              <DropdownMenuItem onClick={() => onUpdateStatus(ticket.id, 'valid')}>
                <Clock className="h-4 w-4 mr-2" />
                Desfazer Validação
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {ticket.status !== 'cancelled' && (
              <DropdownMenuItem 
                onClick={() => onUpdateStatus(ticket.id, 'cancelled')}
                className="text-destructive"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancelar Ingresso
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
