import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, MapPin, Clock, User, CreditCard, Ticket } from 'lucide-react';

export interface TicketData {
  id: string;
  ticketCode: string;
  holderName: string;
  status: 'valid' | 'used' | 'cancelled';
  event: {
    title: string;
    date: string;
    time: string;
    venue: string;
    city: string;
    state: string;
    imageUrl?: string;
  };
  lot: {
    name: string;
    price: number;
  };
  purchaseDate: string;
  paymentMethod?: string;
}

interface TicketCardProps {
  ticket: TicketData;
  className?: string;
}

const TicketCard = ({ ticket, className = '' }: TicketCardProps) => {
  const eventDate = new Date(ticket.event.date + 'T00:00:00');
  const purchaseDate = new Date(ticket.purchaseDate);
  
  const statusConfig = {
    valid: {
      label: 'Válido',
      bgColor: 'bg-green-500/10',
      textColor: 'text-green-500',
      borderColor: 'border-green-500/30',
    },
    used: {
      label: 'Utilizado',
      bgColor: 'bg-muted',
      textColor: 'text-muted-foreground',
      borderColor: 'border-muted',
    },
    cancelled: {
      label: 'Cancelado',
      bgColor: 'bg-destructive/10',
      textColor: 'text-destructive',
      borderColor: 'border-destructive/30',
    },
  };

  const currentStatus = statusConfig[ticket.status];

  return (
    <div className={`relative bg-card rounded-2xl overflow-hidden shadow-lg border border-border ${className}`}>
      {/* Ticket Header with Event Image */}
      <div className="relative h-32 overflow-hidden">
        {ticket.event.imageUrl ? (
          <img
            src={ticket.event.imageUrl}
            alt={ticket.event.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        
        {/* Status Badge */}
        <div className="absolute top-3 right-3">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${currentStatus.bgColor} ${currentStatus.textColor} border ${currentStatus.borderColor}`}>
            {currentStatus.label}
          </span>
        </div>

        {/* Logo/Brand */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/90 flex items-center justify-center">
            <Ticket className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-xs font-semibold text-foreground/80 drop-shadow-md">IngressosRP</span>
        </div>
      </div>

      {/* Event Info */}
      <div className="p-4 pb-2">
        <h3 className="text-lg font-bold text-foreground line-clamp-2 mb-3">
          {ticket.event.title}
        </h3>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4 text-primary" />
            <span>{format(eventDate, "dd 'de' MMM, yyyy", { locale: ptBR })}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4 text-primary" />
            <span>{ticket.event.time.slice(0, 5)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground col-span-2">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">{ticket.event.venue} - {ticket.event.city}/{ticket.event.state}</span>
          </div>
        </div>
      </div>

      {/* Divider with circles */}
      <div className="relative my-3">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-background rounded-r-full" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-background rounded-l-full" />
        <div className="border-t-2 border-dashed border-border mx-6" />
      </div>

      {/* Ticket Details & QR Code */}
      <div className="px-4 pb-4">
        <div className="flex gap-4">
          {/* Left: Details */}
          <div className="flex-1 space-y-3">
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Participante</span>
              <div className="flex items-center gap-2 mt-0.5">
                <User className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground text-sm">{ticket.holderName}</span>
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Ingresso</span>
              <p className="font-medium text-foreground text-sm">{ticket.lot.name}</p>
            </div>

            <div className="flex gap-4">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Valor</span>
                <p className="font-bold text-primary text-sm">
                  {ticket.lot.price === 0 ? 'Grátis' : `R$ ${ticket.lot.price.toFixed(2)}`}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Pagamento</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <CreditCard className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm text-foreground">{ticket.paymentMethod || 'Pix'}</span>
                </div>
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Compra</span>
              <p className="text-sm text-foreground">
                {format(purchaseDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>

          {/* Right: QR Code */}
          <div className="flex flex-col items-center justify-center">
            <div className={`p-2 rounded-xl bg-white ${ticket.status !== 'valid' ? 'opacity-40 grayscale' : ''}`}>
              <QRCodeSVG
                value={ticket.ticketCode}
                size={100}
                level="H"
                includeMargin={false}
              />
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 font-mono">
              {ticket.ticketCode.slice(0, 8).toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-muted/50 px-4 py-2 text-center">
        <p className="text-[10px] text-muted-foreground">
          Apresente este QR Code na entrada do evento • Ingresso pessoal e intransferível
        </p>
      </div>
    </div>
  );
};

export default TicketCard;
