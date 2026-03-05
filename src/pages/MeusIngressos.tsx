import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Ticket, Calendar, MapPin, Clock, CheckCircle2, XCircle, QrCode, Download, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useUserTickets, UserTicket } from '@/hooks/useUserTickets';
import { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const TicketCardSimple = ({ ticket }: { ticket: UserTicket }) => {
  const navigate = useNavigate();
  const [showQR, setShowQR] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);
  
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
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`ingresso-${ticket.ticket_code.slice(0, 8)}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsDownloading(false);
    }
  };
  
  const statusConfig = {
    pending: { label: 'Pendente', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', icon: Clock },
    valid: { label: 'Válido', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle2 },
    used: { label: 'Utilizado', color: 'bg-muted text-muted-foreground border-muted', icon: CheckCircle2 },
    cancelled: { label: 'Cancelado', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
  };

  const status = statusConfig[ticket.status];
  const StatusIcon = status.icon;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return format(date, "dd 'de' MMMM", { locale: ptBR });
  };

  const formatTime = (timeStr: string) => {
    return timeStr.slice(0, 5);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50 bg-card">
          <CardContent className="p-0">
            <div className="flex flex-col sm:flex-row">
              {/* Event Image */}
              <div className="relative w-full sm:w-40 h-32 sm:h-auto shrink-0">
                <img
                  src={ticket.event.image_url || '/placeholder.svg'}
                  alt={ticket.event.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent sm:hidden" />
              </div>

              {/* Ticket Info */}
              <div className="flex-1 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 
                      className="font-semibold text-foreground hover:text-primary cursor-pointer transition-colors line-clamp-1"
                      onClick={() => navigate(`/evento/${ticket.event.id}`)}
                    >
                      {ticket.event.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{ticket.lot.name}</p>
                  </div>
                  <Badge variant="outline" className={status.color}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {status.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(ticket.event.date)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatTime(ticket.event.time)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 col-span-2">
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="truncate">{ticket.event.venue} - {ticket.event.city}/{ticket.event.state}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-muted-foreground" />
                    <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                      {ticket.ticket_code.slice(0, 8).toUpperCase()}
                    </code>
                  </div>
                  {ticket.status === 'valid' && (
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-1.5" 
                        onClick={handleDownloadPDF}
                        disabled={isDownloading}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {isDownloading ? 'Gerando...' : 'PDF'}
                      </Button>
                      <Button size="sm" variant="gradient" className="gap-1.5" onClick={() => setShowQR(true)}>
                        <Smartphone className="w-3.5 h-3.5" />
                        Usar Ingresso
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Hidden ticket for PDF generation */}
      <div className="fixed -left-[9999px]">
        <div ref={ticketRef} className="bg-white p-8 w-[400px]">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{ticket.event.title}</h2>
            <p className="text-gray-600">{ticket.lot.name}</p>
          </div>
          <div className="flex justify-center mb-6">
            <QRCodeSVG
              value={ticket.ticket_code}
              size={200}
              level="H"
              includeMargin={false}
            />
          </div>
          <div className="text-center mb-4">
            <p className="font-mono text-lg font-bold text-gray-900">
              {ticket.ticket_code.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-gray-600">{ticket.holder_name}</p>
          </div>
          <div className="border-t pt-4 space-y-2 text-sm text-gray-700">
            <p><strong>Data:</strong> {formatDate(ticket.event.date)} às {formatTime(ticket.event.time)}</p>
            <p><strong>Local:</strong> {ticket.event.venue}</p>
            <p><strong>Cidade:</strong> {ticket.event.city}/{ticket.event.state}</p>
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="relative bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/20 flex items-center justify-center">
                <Ticket className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold">Seu Ingresso</h2>
              <p className="text-sm text-primary-foreground/80">Apresente na entrada do evento</p>
            </div>

            <div className="bg-white rounded-2xl p-6 text-center">
              <QRCodeSVG
                value={ticket.ticket_code}
                size={200}
                level="H"
                includeMargin={false}
                className="mx-auto"
              />
              <p className="mt-4 font-mono text-lg font-bold text-gray-900">
                {ticket.ticket_code.slice(0, 8).toUpperCase()}
              </p>
              <p className="text-sm text-gray-500 mt-1">{ticket.holder_name}</p>
            </div>

            <div className="mt-6 space-y-2 text-center text-sm">
              <p className="font-semibold">{ticket.event.title}</p>
              <p className="text-primary-foreground/80">
                {formatDate(ticket.event.date)} às {formatTime(ticket.event.time)}
              </p>
              <p className="text-primary-foreground/80">{ticket.lot.name}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const TicketSkeleton = () => (
  <Card className="overflow-hidden">
    <CardContent className="p-0">
      <div className="flex flex-col sm:flex-row">
        <Skeleton className="w-full sm:w-40 h-32" />
        <div className="flex-1 p-4 sm:p-5 space-y-3">
          <div className="flex justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-44 col-span-2" />
          </div>
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="text-center py-16"
  >
    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
      <Ticket className="w-10 h-10 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
    <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{description}</p>
    <Button variant="gradient" onClick={() => window.location.href = '/'}>
      Explorar Eventos
    </Button>
  </motion.div>
);

const MeusIngressos = () => {
  const { upcomingTickets, pastTickets, cancelledTickets, isLoading } = useUserTickets();

  return (
    <>
      <Helmet>
        <title>Meus Ingressos | IngressosRP</title>
        <meta name="description" content="Visualize e gerencie seus ingressos para eventos." />
      </Helmet>

      <Header />

      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Ticket className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
                Meus Ingressos
              </h1>
            </div>
            <p className="text-muted-foreground">
              Gerencie seus ingressos e acompanhe seus eventos
            </p>
          </motion.div>

          {/* Tabs */}
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="w-full sm:w-auto mb-6 bg-muted/50">
              <TabsTrigger value="upcoming" className="flex-1 sm:flex-none gap-2">
                <Ticket className="w-4 h-4" />
                Próximos
                {upcomingTickets.length > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary">
                    {upcomingTickets.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="past" className="flex-1 sm:flex-none gap-2">
                Anteriores
                {pastTickets.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {pastTickets.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="flex-1 sm:flex-none gap-2">
                Cancelados
                {cancelledTickets.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {cancelledTickets.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-4">
              {isLoading ? (
                <>
                  <TicketSkeleton />
                  <TicketSkeleton />
                </>
              ) : upcomingTickets.length > 0 ? (
                upcomingTickets.map((ticket) => (
                  <TicketCardSimple key={ticket.id} ticket={ticket} />
                ))
              ) : (
                <EmptyState
                  title="Nenhum ingresso encontrado"
                  description="Você ainda não tem ingressos para eventos futuros. Explore nossos eventos e garanta o seu!"
                />
              )}
            </TabsContent>

            <TabsContent value="past" className="space-y-4">
              {isLoading ? (
                <>
                  <TicketSkeleton />
                  <TicketSkeleton />
                </>
              ) : pastTickets.length > 0 ? (
                pastTickets.map((ticket) => (
                  <TicketCardSimple key={ticket.id} ticket={ticket} />
                ))
              ) : (
                <EmptyState
                  title="Nenhum evento anterior"
                  description="Você ainda não participou de nenhum evento. Comece explorando nossos eventos!"
                />
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="space-y-4">
              {isLoading ? (
                <TicketSkeleton />
              ) : cancelledTickets.length > 0 ? (
                cancelledTickets.map((ticket) => (
                  <TicketCardSimple key={ticket.id} ticket={ticket} />
                ))
              ) : (
                <EmptyState
                  title="Nenhum ingresso cancelado"
                  description="Você não tem nenhum ingresso cancelado."
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default MeusIngressos;
