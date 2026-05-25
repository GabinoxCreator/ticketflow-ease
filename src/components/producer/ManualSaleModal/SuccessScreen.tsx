import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Copy, Download, MessageCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Event } from '@/hooks/useEvents';
import { ManualSaleResult } from '@/hooks/useManualSale';
import { buildWhatsAppMessage, formatWhatsAppDeepLink, PAYMENT_METHOD_LABELS } from './utils';
import { generateManualSaleTicketsPDF } from '@/utils/manualSaleTicketsPdf';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  event: Pick<Event, 'id' | 'title' | 'date' | 'time' | 'venue' | 'city' | 'state'>;
  result: ManualSaleResult;
  onClose: () => void;
  onNew: () => void;
}

const fmtBRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export function SuccessScreen({ event, result, onClose, onNew }: Props) {
  const [pdfLoading, setPdfLoading] = useState(false);

  // Aggregate items by lot_name for the message
  const aggregated = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of result.tickets) map.set(t.lot_name, (map.get(t.lot_name) ?? 0) + 1);
    return Array.from(map.entries()).map(([lot_name, quantity]) => ({ lot_name, quantity }));
  }, [result.tickets]);

  // Best-effort method label from the order (we didn't echo it; reuse "Pagamento")
  const methodLabel = 'pagamento';

  const message = useMemo(
    () =>
      buildWhatsAppMessage({
        buyerFirstName: result.customer.name.split(' ')[0] || result.customer.name,
        eventTitle: event.title,
        eventDate: event.date,
        eventTime: event.time,
        venue: event.venue,
        city: event.city,
        items: aggregated,
        total: result.totals.total,
        methodLabel: methodLabel.toUpperCase(),
      }),
    [event, result, aggregated],
  );

  const waLink = formatWhatsAppDeepLink(result.customer.whatsapp, message);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Mensagem copiada!');
    } catch {
      toast.error('Não foi possível copiar. Selecione manualmente.');
    }
  };

  const handlePdf = async () => {
    setPdfLoading(true);
    try {
      // We need lot_name per ticket — already in result.tickets
      await generateManualSaleTicketsPDF(
        result.tickets.map((t) => ({
          ticket_code: t.ticket_code,
          lot_name: t.lot_name,
          holder_name: result.customer.name,
        })),
        {
          title: event.title,
          date: event.date,
          time: event.time,
          venue: event.venue,
          city: event.city,
          state: event.state,
        },
      );
    } catch (e: any) {
      toast.error('Erro ao gerar PDF: ' + (e.message ?? e));
    } finally {
      setPdfLoading(false);
    }
  };

  // Surface short order code
  const orderShort = result.order_id.slice(0, 8).toUpperCase();

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mb-2">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <p className="text-sm text-muted-foreground">Pedido #{orderShort} — {fmtBRL(result.totals.total)}</p>
      </div>

      {/* Bloco 1 — confirmação */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm space-y-1">
        {result.email_sent ? (
          <p>✓ Email com ingressos enviado para <strong>{result.customer.email}</strong></p>
        ) : (
          <p className="text-amber-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            Email não enviado. Use o botão de copiar mensagem abaixo.
          </p>
        )}
        <p>✓ Venda contabilizada na receita do evento</p>
        <p>✓ {result.tickets.length} ingresso(s) gerado(s) com QR Code</p>
      </div>

      {/* Bloco 2 — mensagem WhatsApp */}
      <div className="space-y-2">
        <div className="rounded-xl bg-muted/30 border border-border/40 p-3 text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-56 overflow-y-auto">
          {message}
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy} className="w-full sm:w-auto">
          <Copy className="h-4 w-4 mr-2" /> Copiar mensagem
        </Button>
      </div>

      {/* Bloco 3 — PDF */}
      <Button onClick={handlePdf} disabled={pdfLoading} variant="outline" className="w-full">
        {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        Baixar PDF dos ingressos
      </Button>

      {/* Bloco 4 — WhatsApp deep link */}
      {waLink ? (
        <div className="space-y-1.5">
          <a href={waLink} target="_blank" rel="noopener noreferrer" className="block">
            <Button className="w-full bg-[#25D366] hover:bg-[#1ebe57] text-white">
              <MessageCircle className="h-4 w-4 mr-2" /> Abrir WhatsApp do comprador
            </Button>
          </a>
          <p className="text-[11px] text-muted-foreground">
            O PDF precisa ser anexado manualmente após abrir o WhatsApp — o deep link não suporta anexo automático.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
        <Button variant="outline" onClick={onNew}>+ Registrar outra venda</Button>
      </div>
    </div>
  );
}
