import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Ticket, Calendar, MapPin, Clock, CheckCircle2, XCircle, QrCode, Download, Smartphone, Ban, Share2, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generateTicketPDF } from '@/utils/ticketPdf';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useUserTickets, UserTicket } from '@/hooks/useUserTickets';
import { formatEventDate, formatInSaoPaulo } from '@/lib/eventTime';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function groupByOrder(tickets: UserTicket[]): UserTicket[][] {
  const map = new Map<string, UserTicket[]>();
  const order: string[] = [];
  for (const t of tickets) {
    const key = t.order_id ?? t.id;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(t);
  }
  // ordenação estável dentro do grupo
  for (const key of order) {
    map.get(key)!.sort((a, b) => {
      const la = a.seat?.label ?? a.ticket_code;
      const lb = b.seat?.label ?? b.ticket_code;
      return la.localeCompare(lb, 'pt-BR', { numeric: true });
    });
  }
  return order.map((k) => map.get(k)!);
}

const OrderGroupCard = ({ tickets }: { tickets: UserTicket[] }) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  if (tickets.length === 1) {
    return <TicketCardSimple ticket={tickets[0]} />;
  }

  const first = tickets[0];
  const event = first.event;
  const counts = {
    valid: tickets.filter((t) => t.status === 'valid').length,
    used: tickets.filter((t) => t.status === 'used').length,
    cancelled: tickets.filter((t) => t.status === 'cancelled').length,
    pending: tickets.filter((t) => t.status === 'pending').length,
  };
  const statusBits: string[] = [];
  if (counts.valid) statusBits.push(`${counts.valid} válido${counts.valid > 1 ? 's' : ''}`);
  if (counts.used) statusBits.push(`${counts.used} utilizado${counts.used > 1 ? 's' : ''}`);
  if (counts.cancelled) statusBits.push(`${counts.cancelled} cancelado${counts.cancelled > 1 ? 's' : ''}`);
  if (counts.pending) statusBits.push(`${counts.pending} pendente${counts.pending > 1 ? 's' : ''}`);

  const formatDate = (dateStr: string) =>
    formatEventDate(dateStr, { day: '2-digit', month: 'long' });
  const formatTime = (timeStr: string) => timeStr.slice(0, 5);

  const sideBar =
    counts.valid > 0
      ? 'bg-gradient-to-b from-primary to-accent'
      : counts.used === tickets.length
      ? 'bg-muted-foreground/40'
      : counts.cancelled === tickets.length
      ? 'bg-destructive'
      : 'bg-yellow-500';

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="group relative overflow-hidden border-border/50 bg-card/60 backdrop-blur-xl hover:shadow-glow hover:border-primary/30 transition-all duration-500">
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${sideBar}`} />
        <CardContent className="p-0">
          <div className="relative w-full aspect-[16/10] overflow-hidden bg-muted/40">
            <img
              src={event.image_url || '/placeholder.svg'}
              alt={event.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent pointer-events-none" />
            <Badge
              variant="outline"
              className="absolute top-3 right-3 bg-background/70 backdrop-blur-md border-primary/30 text-primary shadow-lg"
            >
              <Ticket className="w-3 h-3 mr-1" />
              {tickets.length} ingressos
            </Badge>
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3
                className="font-display font-bold text-lg text-foreground hover:text-primary cursor-pointer transition-colors line-clamp-1 drop-shadow-lg"
                onClick={() => navigate(`/evento/${event.slug ?? event.id}`)}
              >
                {event.title}
              </h3>
              {statusBits.length > 0 && (
                <p className="text-xs text-muted-foreground/90 drop-shadow">{statusBits.join(' · ')}</p>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl bg-muted/40 border border-border/40 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  <Calendar className="w-3 h-3" /><span>Data</span>
                </div>
                <p className="text-sm font-semibold text-foreground">{formatDate(event.date)}</p>
              </div>
              <div className="rounded-xl bg-muted/40 border border-border/40 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  <Clock className="w-3 h-3" /><span>Horário</span>
                </div>
                <p className="text-sm font-semibold text-foreground">{formatTime(event.time)}</p>
              </div>
              <div className="rounded-xl bg-muted/40 border border-border/40 p-3 col-span-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  <MapPin className="w-3 h-3" /><span>Local</span>
                </div>
                <p className="text-sm font-semibold text-foreground truncate">
                  {event.venue} — {event.city}/{event.state}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {expanded ? 'Ocultar ingressos' : `Ver ingressos (${tickets.length})`}
            </Button>
          </div>

          {expanded && (
            <div className="px-3 sm:px-4 pb-4 pt-1 space-y-3 border-t border-border/40 bg-muted/10">
              <p className="text-xs text-muted-foreground pt-3 px-1">
                Cada ingresso abaixo tem um QR code único — toque em "Usar Ingresso" para apresentar.
              </p>
              {tickets.map((t) => (
                <TicketCardSimple key={t.id} ticket={t} compact />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};




const TicketCardSimple = ({ ticket, compact = false }: { ticket: UserTicket; compact?: boolean }) => {
  const navigate = useNavigate();
  const [showQR, setShowQR] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      await generateTicketPDF(ticket);
      toast.success('Ingresso baixado com sucesso!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Não foi possível gerar o PDF. Tente novamente.');
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

  const formatDate = (dateStr: string) =>
    formatEventDate(dateStr, { day: '2-digit', month: 'long' });


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
      url: window.location.origin + `/evento/${ticket.event.slug ?? ticket.event.id}`,
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
      {compact ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="relative overflow-hidden border-border/50 bg-card/80">
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
              ticket.status === 'valid' ? 'bg-gradient-to-b from-primary to-accent' :
              ticket.status === 'used' ? 'bg-muted-foreground/40' :
              ticket.status === 'cancelled' ? 'bg-destructive' :
              'bg-yellow-500'
            }`} />
            <CardContent className="p-3 sm:p-4 pl-4 sm:pl-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
                    <QrCode className="w-4 h-4 text-primary" />
                  </div>
                  <code className="text-xs font-mono font-semibold text-foreground bg-muted/60 px-2 py-1 rounded border border-border/40 truncate">
                    {ticket.ticket_code.slice(0, 8).toUpperCase()}
                  </code>
                </div>
                <Badge
                  variant="outline"
                  className={`${status.color} shrink-0`}
                >
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {status.label}
                </Badge>
              </div>
              {seatDisplay && (
                <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1.5 text-primary">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-bold leading-tight break-words">{seatDisplay}</span>
                </div>
              )}
              <div className="flex gap-2 justify-end flex-wrap">
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
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="group relative overflow-hidden border-border/50 bg-card/60 backdrop-blur-xl hover:shadow-glow hover:border-primary/30 transition-all duration-500">
            {/* Faixa lateral colorida por status */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
              ticket.status === 'valid' ? 'bg-gradient-to-b from-primary to-accent' :
              ticket.status === 'used' ? 'bg-muted-foreground/40' :
              ticket.status === 'cancelled' ? 'bg-destructive' :
              'bg-yellow-500'
            }`} />
            <CardContent className="p-0">
              {/* Event Image */}
              <div className="relative w-full aspect-[16/10] overflow-hidden bg-muted/40">
                <img
                  src={ticket.event.image_url || '/placeholder.svg'}
                  alt={ticket.event.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent pointer-events-none" />
                <Badge
                  variant="outline"
                  className={`absolute top-3 right-3 ${status.color} backdrop-blur-md bg-background/70 shadow-lg`}
                >
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {status.label}
                </Badge>

                {/* Título sobreposto na imagem */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h3
                    className="font-display font-bold text-lg text-foreground hover:text-primary cursor-pointer transition-colors line-clamp-1 drop-shadow-lg"
                    onClick={() => navigate(`/evento/${ticket.event.slug ?? ticket.event.id}`)}
                  >
                    {ticket.event.title}
                  </h3>
                  <p className="text-sm text-muted-foreground/90 drop-shadow">{ticket.lot?.name ?? ticket.seat?.seat_type_name ?? ticket.seat?.label ?? 'Mesa'}</p>
                </div>
              </div>

              {/* Ticket Info */}
              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl bg-muted/40 border border-border/40 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      <Calendar className="w-3 h-3" />
                      <span>Data</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{formatDate(ticket.event.date)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 border border-border/40 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      <Clock className="w-3 h-3" />
                      <span>Horário</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{formatTime(ticket.event.time)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 border border-border/40 p-3 col-span-2">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      <MapPin className="w-3 h-3" />
                      <span>Local</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground truncate">{ticket.event.venue} — {ticket.event.city}/{ticket.event.state}</p>
                  </div>
                </div>

                {/* Perfuração estilo ticket */}
                <div className="relative my-4">
                  <div className="absolute -left-5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-background border border-border/50" />
                  <div className="absolute -right-5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-background border border-border/50" />
                  <div className="border-t border-dashed border-border/60" />
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <QrCode className="w-4 h-4 text-primary" />
                    </div>
                    <code className="text-xs font-mono font-semibold text-foreground bg-muted/60 px-2 py-1 rounded border border-border/40">
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
            </CardContent>
          </Card>
        </motion.div>
      )}



      {/* Modal de Ingresso — visual premium estilo "ticket digital" */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-md p-0 border-0 bg-card max-h-[100dvh] sm:max-h-[90dvh] h-[100dvh] sm:h-auto flex flex-col overflow-hidden gap-0">
          {/* HEADER sticky (não rola) */}
          <div className="shrink-0 relative overflow-hidden">
            {ticket.event.image_url && (
              <img
                src={ticket.event.image_url}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
              />
            )}
            <div className={`relative bg-gradient-to-br ${modal.heroGradient} px-6 pt-5 pb-4 text-white`}>
              <div className="flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                  className="w-12 h-12 mb-2 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30"
                >
                  <ModalHeroIcon className="w-6 h-6" />
                </motion.div>
                <h2 className="text-lg font-display font-bold">{modal.heroTitle}</h2>
                <p className="text-xs text-white/85 mt-0.5">{modal.heroSubtitle}</p>
              </div>
            </div>
          </div>

          {/* BODY scrollável */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* PERFURAÇÃO estilo ticket */}
            <div className="relative h-6 bg-card">
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background" />
              <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background" />
              <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 border-t border-dashed border-border" />
            </div>

            <div className="px-6 pb-5 -mt-1">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="bg-white rounded-2xl p-4 shadow-md text-center relative overflow-hidden"
              >
                <div className="relative inline-block">
                  <QRCodeSVG
                    value={ticket.ticket_code}
                    size={180}
                    level="H"
                    includeMargin={false}
                    className={`mx-auto transition-all ${modal.qrFaded ? 'opacity-30 grayscale' : ''}`}
                  />
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
                <p className="mt-3 font-mono text-base font-bold text-gray-900">
                  {ticket.ticket_code.slice(0, 8).toUpperCase()}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{ticket.holder_name}</p>
              </motion.div>

              {/* Detalhes do evento */}
              <div className="mt-4 space-y-2 text-sm">
                <p className="font-semibold text-foreground text-center text-base mb-2">
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
                  <span>{ticket.lot?.name ?? ticket.seat?.seat_type_name ?? ticket.seat?.label ?? 'Mesa'}</span>
                </div>
                {ticket.status === 'used' && ticket.validated_at && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Validado em {formatInSaoPaulo(ticket.validated_at)}</span>
                  </div>
                )}
              </div>

              {/* Banner de status */}
              <div className={`mt-4 flex items-center gap-2 px-4 py-3 rounded-xl border ${modal.bannerBg}`}>
                <ModalBannerIcon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-semibold">{modal.bannerText}</span>
              </div>
            </div>
          </div>

          {/* FOOTER sticky com ações */}
          <div className="shrink-0 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
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
        </DialogContent>

      </Dialog>
    </>
  );
};

const TicketSkeleton = () => (
  <Card className="overflow-hidden">
    <CardContent className="p-0">
      <Skeleton className="w-full aspect-[16/10]" />
      <div className="p-4 sm:p-5 space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-44 col-span-2" />
        </div>
        <Skeleton className="h-8 w-full" />
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
          {/* Hero Header Premium */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <Card className="relative overflow-hidden border-border/50 bg-gradient-to-br from-primary/15 via-card to-accent/10 backdrop-blur-xl">
              {/* Glow decorativo */}
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-accent/15 blur-3xl pointer-events-none" />

              <CardContent className="relative p-6 sm:p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow shrink-0">
                    <Ticket className="w-7 h-7 sm:w-8 sm:h-8 text-primary-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-1">
                      Meus Ingressos
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      Gerencie seus ingressos e acesse seus QR codes
                    </p>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 backdrop-blur-sm p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground mb-1">Próximos</div>
                    <div className="text-2xl sm:text-3xl font-display font-bold text-primary">
                      {isLoading ? '—' : upcomingTickets.length}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/30 backdrop-blur-sm p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground mb-1">Anteriores</div>
                    <div className="text-2xl sm:text-3xl font-display font-bold text-foreground">
                      {isLoading ? '—' : pastTickets.length}
                    </div>
                  </div>
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 backdrop-blur-sm p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground mb-1">Cancelados</div>
                    <div className="text-2xl sm:text-3xl font-display font-bold text-destructive">
                      {isLoading ? '—' : cancelledTickets.length}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Tabs */}
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="w-full mb-6 bg-card/60 backdrop-blur-xl border border-border/50 p-1 h-auto">
              <TabsTrigger
                value="upcoming"
                className="flex-1 min-w-0 gap-1.5 px-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary/20 data-[state=active]:to-accent/15 data-[state=active]:text-primary data-[state=active]:shadow-sm py-2"
              >
                <Ticket className="w-4 h-4 hidden sm:inline-flex shrink-0" />
                <span className="truncate">Próximos</span>
                {upcomingTickets.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 bg-primary/15 text-primary border-0 shrink-0">
                    {upcomingTickets.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="past"
                className="flex-1 min-w-0 gap-1.5 px-2 data-[state=active]:bg-muted/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm py-2"
              >
                <span className="truncate">Anteriores</span>
                {pastTickets.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 border-0 shrink-0">
                    {pastTickets.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="cancelled"
                className="flex-1 min-w-0 gap-1.5 px-2 data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive data-[state=active]:shadow-sm py-2"
              >
                <span className="truncate">Cancelados</span>
                {cancelledTickets.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 bg-destructive/15 text-destructive border-0 shrink-0">
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
                groupByOrder(upcomingTickets).map((group) => (
                  <OrderGroupCard key={group[0].order_id ?? group[0].id} tickets={group} />
                ))
              ) : (
                <EmptyState
                  title="Nenhum ingresso encontrado"
                  description="Você ainda não tem ingressos para eventos futuros. "
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
                groupByOrder(pastTickets).map((group) => (
                  <OrderGroupCard key={group[0].order_id ?? group[0].id} tickets={group} />
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
                groupByOrder(cancelledTickets).map((group) => (
                  <OrderGroupCard key={group[0].order_id ?? group[0].id} tickets={group} />
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
