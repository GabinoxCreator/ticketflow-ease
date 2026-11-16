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
import { precoPorIngresso } from '@/lib/lote-em-grupo';

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
            Ainda não entrou
          </Badge>
        );
      case 'used':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Entrou
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
    // No celular a linha empilha (OS-408): antes o nome espremido ao lado do lote quebrava
    // em três linhas. O código do ingresso aparece inteiro; só corta se faltar espaço.
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border bg-card hover:bg-card/80 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-x-3 gap-y-1 mb-1 flex-wrap">
          <h4 className="font-medium break-words min-w-0">{ticket.holder_name}</h4>
          {getStatusBadge()}
        </div>
        
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {ticket.holder_email && (
            <div className="flex items-center gap-1 min-w-0 max-w-full">
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{ticket.holder_email}</span>
            </div>
          )}
          {ticket.holder_phone && (
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {ticket.holder_phone}
            </div>
          )}
          <div className="flex items-center gap-1 min-w-0 max-w-full">
            <QrCode className="h-3 w-3 flex-shrink-0" />
            <code className="text-xs bg-muted px-1 rounded truncate">{ticket.ticket_code}</code>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 justify-between sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="font-medium">{ticket.lot?.name || 'Lote'}</p>
          {ticket.lot?.price && (
            <p className="text-sm text-muted-foreground">
              {/* Lote em dupla: o preço do lote é o do par; cada ingresso vale a metade (OS-317). */}
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(precoPorIngresso(ticket.lot))}
            </p>
          )}
          {ticket.validated_at && (
            <p className="text-xs text-muted-foreground">
              Entrou em {format(new Date(ticket.validated_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
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
                Marcar que entrou
              </DropdownMenuItem>
            )}
            {ticket.status === 'used' && (
              <DropdownMenuItem onClick={() => onUpdateStatus(ticket.id, 'valid')}>
                <Clock className="h-4 w-4 mr-2" />
                Desfazer a entrada
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
