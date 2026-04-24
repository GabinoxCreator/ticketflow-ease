import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Ticket, Calendar, MapPin, Clock, CheckCircle2, XCircle, QrCode, Download, Smartphone, Ban, Share2, Eye } from 'lucide-react';
import { toast } from 'sonner';
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

  // Configuração visual completa do modal por status
  const modalConfig = {
    pending: {
      heroGradient: 'from-yellow-500/90 via-yellow-600/90 to-amber-700/90',
      heroIcon: Clock,
      heroTitle: 'Ingresso Pendente',
      heroSubtitle: 'Aguardando confirmação de pagamento',
      qrFaded: true,
      stamp: null as string | null,
      stampColor: '',
      bannerBg: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600',
      bannerIcon: Clock,
      bannerText: 'Aguardando pagamento',
      ctaLabel: 'Ver Ingresso',
      ctaIcon: Eye,
      ctaVariant: 'outline' as const,
      cardBtnClass: '',
    },
    valid: {
      heroGradient: 'from-emerald-500/95 via-green-600/95 to-emerald-700/95',
      heroIcon: CheckCircle2,
      heroTitle: 'Seu Ingresso',
      heroSubtitle: 'Apresente este QR Code na entrada',
      qrFaded: false,
      stamp: null,
      stampColor: '',
      bannerBg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
      bannerIcon: CheckCircle2,
      bannerText: 'Ingresso válido — Pronto para uso',
      ctaLabel: 'Usar Ingresso',
      ctaIcon: Smartphone,
      ctaVariant: 'gradient' as const,
      cardBtnClass: '',
    },
    used: {
      heroGradient: 'from-rose-600/95 via-red-700/95 to-rose-900/95',
      heroIcon: XCircle,
      heroTitle: 'Ingresso Utilizado',
      heroSubtitle: 'Este ingresso já foi validado na entrada',
      qrFaded: true,
      stamp: 'UTILIZADO',
      stampColor: 'text-red-600 border-red-600',
      bannerBg: 'bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400',
      bannerIcon: XCircle,
      bannerText: 'Ingresso já utilizado',
      ctaLabel: 'Ver Ingresso',
      ctaIcon: Eye,
      ctaVariant: 'outline' as const,
      cardBtnClass: '',
    },
    cancelled: {
      heroGradient: 'from-zinc-700/95 via-red-900/95 to-zinc-900/95',
      heroIcon: Ban,
      heroTitle: 'Ingresso Cancelado',
      heroSubtitle: 'Este ingresso não é mais válido',
      qrFaded: true,
      stamp: 'CANCELADO',
      stampColor: 'text-destructive border-destructive',
      bannerBg: 'bg-destructive/15 border-destructive/40 text-destructive',
      bannerIcon: Ban,
      bannerText: 'Ingresso cancelado',
      ctaLabel: 'Ver Detalhes',
      ctaIcon: Eye,
      ctaVariant: 'outline' as const,
      cardBtnClass: 'border-destructive/30 text-destructive hover:bg-destructive/10',
    },
  };

  const modal = modalConfig[ticket.status];
  const ModalHeroIcon = modal.heroIcon;
  const ModalBannerIcon = modal.bannerIcon;
  const CtaIcon = modal.ctaIcon;

  const handleShare = async () => {
    const shareData = {
      title: `Ingresso — ${ticket.event.title}`,
      text: `Meu ingresso para ${ticket.event.title} em ${formatDate(ticket.event.date)} às ${formatTime(ticket.event.time)}.`,
      url: window.location.origin + `/evento/${ticket.event.id}`,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        toast.success('Link copiado para a área de transferência');
      }
    } catch (err) {
      // user cancelled — silencioso
    }
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
              {/* Event Image — banner completo, mais largo */}
              <div className="relative w-full sm:w-56 h-32 sm:h-auto shrink-0 bg-muted/40">
                <img
                  src={ticket.event.image_url || '/placeholder.svg'}
                  alt={ticket.event.title}
                  className="w-full h-full object-contain"
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

                <div className="flex items-center justify-between pt-3 border-t border-border/50 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-muted-foreground" />
                    <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                      {ticket.ticket_code.slice(0, 8).toUpperCase()}
                    </code>
                  </div>
                  <div className="flex gap-2">
                    {ticket.status === 'valid' && (
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
                    )}
                    <Button
                      size="sm"
                      variant={modal.ctaVariant}
                      className={`gap-1.5 ${modal.cardBtnClass}`}
                      onClick={() => setShowQR(true)}
                    >
                      <CtaIcon className="w-3.5 h-3.5" />
                      {modal.ctaLabel}
                    </Button>
                  </div>
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

      {/* Modal de Ingresso — visual premium estilo "ticket digital" */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-0 bg-card">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {/* HERO — banner desfocado + gradiente colorido por status */}
            <div className="relative overflow-hidden">
              {ticket.event.image_url && (
                <img
                  src={ticket.event.image_url}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
                />
              )}
              <div className={`relative bg-gradient-to-br ${modal.heroGradient} px-6 pt-7 pb-6 text-white`}>
                <div className="flex flex-col items-center text-center">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                    className="w-14 h-14 mb-3 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30"
                  >
                    <ModalHeroIcon className="w-7 h-7" />
                  </motion.div>
                  <h2 className="text-xl font-display font-bold">{modal.heroTitle}</h2>
                  <p className="text-sm text-white/85 mt-0.5">{modal.heroSubtitle}</p>
                </div>
              </div>
            </div>

            {/* PERFURAÇÃO estilo ticket */}
            <div className="relative h-6 bg-card">
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background" />
              <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background" />
              <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 border-t border-dashed border-border" />
            </div>

            {/* QR + dados */}
            <div className="px-6 pb-6 -mt-1">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="bg-white rounded-2xl p-5 shadow-md text-center relative overflow-hidden"
              >
                <div className="relative inline-block">
                  <QRCodeSVG
                    value={ticket.ticket_code}
                    size={200}
                    level="H"
                    includeMargin={false}
                    className={`mx-auto transition-all ${modal.qrFaded ? 'opacity-30 grayscale' : ''}`}
                  />
                  {/* Selo diagonal sobre o QR */}
                  {modal.stamp && (
                    <motion.div
                      initial={{ scale: 0, rotate: 0, opacity: 0 }}
                      animate={{ scale: 1, rotate: -15, opacity: 1 }}
                      transition={{ delay: 0.3, type: 'spring', stiffness: 180 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <div className={`px-5 py-2 border-4 rounded-md font-display font-black text-2xl tracking-wider bg-white/95 ${modal.stampColor}`}>
                        {modal.stamp}
                      </div>
                    </motion.div>
                  )}
                </div>
                <p className="mt-4 font-mono text-lg font-bold text-gray-900">
                  {ticket.ticket_code.slice(0, 8).toUpperCase()}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">{ticket.holder_name}</p>
              </motion.div>

              {/* Detalhes do evento */}
              <div className="mt-5 space-y-2.5 text-sm">
                <p className="font-semibold text-foreground text-center text-base mb-3">
                  {ticket.event.title}
                </p>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>{formatDate(ticket.event.date)} às {formatTime(ticket.event.time)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span className="truncate">{ticket.event.venue} — {ticket.event.city}/{ticket.event.state}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Ticket className="w-4 h-4 shrink-0" />
                  <span>{ticket.lot.name}</span>
                </div>
                {ticket.status === 'used' && ticket.validated_at && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Validado em {format(new Date(ticket.validated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
              </div>

              {/* Banner de status */}
              <div className={`mt-5 flex items-center gap-2 px-4 py-3 rounded-xl border ${modal.bannerBg}`}>
                <ModalBannerIcon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-semibold">{modal.bannerText}</span>
              </div>

              {/* Ações */}
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleDownloadPDF}
                  disabled={isDownloading}
                >
                  <Download className="w-4 h-4" />
                  {isDownloading ? 'Gerando...' : 'Baixar PDF'}
                </Button>
                {ticket.status === 'valid' && (
                  <Button
                    variant="gradient"
                    className="flex-1 gap-2"
                    onClick={handleShare}
                  >
                    <Share2 className="w-4 h-4" />
                    Compartilhar
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
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
        <title>Meus Ingressos | FestPag</title>
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
