import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, MapPin, Clock, User, CreditCard, Ticket, Download, Smartphone, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

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
  const ticketRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showFullTicket, setShowFullTicket] = useState(false);
  
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

  const handleDownloadPDF = async () => {
    if (!ticketRef.current) return;
    
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(ticketRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      const margin = 20;
      const imgWidth = pdfWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
      pdf.save(`ingresso-${ticket.ticketCode.slice(0, 8)}.pdf`);
      
      toast.success('Ingresso baixado com sucesso!');
    } catch (error) {
      toast.error('Erro ao baixar ingresso');
      console.error(error);
    } finally {
      setIsDownloading(false);
    }
  };

  const TicketContent = ({ forPDF = false }: { forPDF?: boolean }) => (
    <div 
      className={`relative bg-white rounded-2xl overflow-hidden shadow-lg ${forPDF ? '' : 'border border-border'}`}
      style={forPDF ? { width: '400px', backgroundColor: '#ffffff', color: '#000000' } : {}}
    >
      {/* Ticket Header with Event Image */}
      <div className="relative h-32 overflow-hidden">
        {ticket.event.imageUrl ? (
          <img
            src={ticket.event.imageUrl}
            alt={ticket.event.title}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-400 to-purple-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/60 to-transparent" />
        
        {/* Status Badge */}
        <div className="absolute top-3 right-3">
          <span 
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              forPDF 
                ? ticket.status === 'valid' 
                  ? 'bg-green-100 text-green-700 border border-green-300' 
                  : ticket.status === 'cancelled'
                    ? 'bg-red-100 text-red-700 border border-red-300'
                    : 'bg-gray-100 text-gray-700 border border-gray-300'
                : `${currentStatus.bgColor} ${currentStatus.textColor} border ${currentStatus.borderColor}`
            }`}
          >
            {currentStatus.label}
          </span>
        </div>

        {/* Logo/Brand */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
            <Ticket className="w-4 h-4 text-white" />
          </div>
          <span className="text-xs font-semibold text-gray-700 drop-shadow-md">FestPag</span>
        </div>
      </div>

      {/* Event Info */}
      <div className="p-4 pb-2">
        <h3 className="text-lg font-bold text-gray-900 line-clamp-2 mb-3">
          {ticket.event.title}
        </h3>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-4 h-4 text-purple-600" />
            <span>{format(eventDate, "dd 'de' MMM, yyyy", { locale: ptBR })}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Clock className="w-4 h-4 text-purple-600" />
            <span>{ticket.event.time.slice(0, 5)}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600 col-span-2">
            <MapPin className="w-4 h-4 text-purple-600 shrink-0" />
            <span className="truncate">{ticket.event.venue} - {ticket.event.city}/{ticket.event.state}</span>
          </div>
        </div>
      </div>

      {/* Divider with circles */}
      <div className="relative my-3">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-gray-100 rounded-r-full" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-gray-100 rounded-l-full" />
        <div className="border-t-2 border-dashed border-gray-300 mx-6" />
      </div>

      {/* Ticket Details & QR Code */}
      <div className="px-4 pb-4">
        <div className="flex gap-4">
          {/* Left: Details */}
          <div className="flex-1 space-y-3">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wider">Participante</span>
              <div className="flex items-center gap-2 mt-0.5">
                <User className="w-4 h-4 text-purple-600" />
                <span className="font-semibold text-gray-900 text-sm">{ticket.holderName}</span>
              </div>
            </div>

            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wider">Ingresso</span>
              <p className="font-medium text-gray-900 text-sm">{ticket.lot.name}</p>
            </div>

            <div className="flex gap-4">
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wider">Valor</span>
                <p className="font-bold text-purple-600 text-sm">
                  {ticket.lot.price === 0 ? 'Grátis' : `R$ ${ticket.lot.price.toFixed(2)}`}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wider">Pagamento</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <CreditCard className="w-3 h-3 text-gray-500" />
                  <span className="text-sm text-gray-900">{ticket.paymentMethod || 'Pix'}</span>
                </div>
              </div>
            </div>

            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wider">Compra</span>
              <p className="text-sm text-gray-900">
                {format(purchaseDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>

          {/* Right: QR Code */}
          <div className="flex flex-col items-center justify-center">
            <div className={`p-2 rounded-xl bg-white border border-gray-200 ${ticket.status !== 'valid' ? 'opacity-40 grayscale' : ''}`}>
              <QRCodeSVG
                value={ticket.ticketCode}
                size={100}
                level="H"
                includeMargin={false}
              />
            </div>
            <span className="text-[10px] text-gray-500 mt-1 font-mono">
              {ticket.ticketCode.slice(0, 8).toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-100 px-4 py-2 text-center">
        <p className="text-[10px] text-gray-500">
          Apresente este QR Code na entrada do evento • Ingresso pessoal e intransferível
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Card Preview */}
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
            <span className="text-xs font-semibold text-foreground/80 drop-shadow-md">FestPag</span>
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

        {/* Action Buttons */}
        <div className="bg-muted/50 px-4 py-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            onClick={handleDownloadPDF}
            disabled={isDownloading}
          >
            <Download className="w-4 h-4" />
            {isDownloading ? 'Baixando...' : 'Baixar PDF'}
          </Button>
          {ticket.status === 'valid' && (
            <Button
              variant="gradient"
              size="sm"
              className="flex-1 gap-2"
              onClick={() => setShowFullTicket(true)}
            >
              <Smartphone className="w-4 h-4" />
              Usar Ingresso
            </Button>
          )}
        </div>

        {/* Footer */}
        <div className="bg-muted/50 px-4 py-2 text-center border-t border-border/50">
          <p className="text-[10px] text-muted-foreground">
            Apresente este QR Code na entrada do evento • Ingresso pessoal e intransferível
          </p>
        </div>
      </div>

      {/* Hidden element for PDF generation */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div ref={ticketRef}>
          <TicketContent forPDF />
        </div>
      </div>

      {/* Full Screen Ticket Modal for Entrance */}
      <Dialog open={showFullTicket} onOpenChange={setShowFullTicket}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="relative bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6">
            <button
              onClick={() => setShowFullTicket(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/20 flex items-center justify-center">
                <Ticket className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold">Seu Ingresso</h2>
              <p className="text-sm text-primary-foreground/80">Apresente na entrada do evento</p>
            </div>

            <div className="bg-white rounded-2xl p-6 text-center">
              <QRCodeSVG
                value={ticket.ticketCode}
                size={200}
                level="H"
                includeMargin={false}
                className="mx-auto"
              />
              <p className="mt-4 font-mono text-lg font-bold text-gray-900">
                {ticket.ticketCode.slice(0, 8).toUpperCase()}
              </p>
              <p className="text-sm text-gray-500 mt-1">{ticket.holderName}</p>
            </div>

            <div className="mt-6 space-y-2 text-center text-sm">
              <p className="font-semibold">{ticket.event.title}</p>
              <p className="text-primary-foreground/80">
                {format(eventDate, "dd 'de' MMMM 'às' ", { locale: ptBR })}{ticket.event.time.slice(0, 5)}
              </p>
              <p className="text-primary-foreground/80">{ticket.lot.name}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TicketCard;
