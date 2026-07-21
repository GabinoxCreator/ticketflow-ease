import { useState } from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Mail, Phone, User, Calendar, CreditCard, Ticket as TicketIcon, XCircle, Tag, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Order } from '@/hooks/useEventOrders';
import { useOrderTickets } from '@/hooks/useOrderTickets';
import { CancelManualSaleDialog } from '@/components/producer/CancelManualSaleDialog';

interface Props {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao: 'Cartão',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  transferencia: 'Transferência',
  outro: 'Outro',
};

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const STATUS_LABELS: Record<string, string> = {
  paid: 'Pago', completed: 'Pago', pending: 'Pendente', cancelled: 'Cancelado',
  refunded: 'Reembolsado', failed: 'Falhou', expired: 'Expirado', charged_back: 'Chargeback',
};

export function OrderDetailDrawer({ order, open, onOpenChange }: Props) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const { data: tickets, isLoading: ticketsLoading } = useOrderTickets(order.id, open);

  const isManual = order.sale_origin === 'manual';
  const isPaid = order.status === 'paid' || order.status === 'completed';
  const canCancelManual = isManual && isPaid;
  const canCancelOnline = !isManual && isPaid; // ainda não implementado (escopo 4)

  const total = Number(order.total_amount);
  const fee = Number(order.service_fee_amount || 0);
  const discount = Number(order.discount_amount || 0);
  // total = ingresso − desconto + taxa  ⇒  ingresso = total + desconto − taxa
  const ingresso = total + discount - fee;

  const paymentLabel = isManual
    ? (order.manual_payment_method ? PAYMENT_LABELS[order.manual_payment_method] ?? order.manual_payment_method : '—')
    : (order.payment_method || '—');

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              Pedido
              <Badge variant={isPaid ? 'default' : 'outline'} className={isPaid ? 'bg-green-500 hover:bg-green-600' : ''}>
                {STATUS_LABELS[order.status] ?? order.status}
              </Badge>
              {isManual && <Badge className="bg-primary/15 text-primary border border-primary/30">Manual</Badge>}
              {order.sale_origin === 'courtesy' && <Badge className="bg-orange-500/15 text-orange-400 border border-orange-500/30">Cortesia</Badge>}
            </SheetTitle>
            <SheetDescription>
              {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Cliente */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /> {order.customer_name}</div>
                <div className="flex items-center gap-2 min-w-0"><Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" /> <span className="truncate">{order.customer_email}</span></div>
                {order.customer_phone && (
                  <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {order.customer_phone}</div>
                )}
              </div>
            </section>

            {/* Pagamento */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagamento</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-muted-foreground" /> {paymentLabel}</div>
                <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /> Origem: {order.sale_origin === 'manual' ? 'Venda manual' : order.sale_origin === 'courtesy' ? 'Cortesia' : 'Online'}</div>
                {isManual && order.manual_payment_note && (
                  <p className="text-xs text-muted-foreground break-words">Nota: {order.manual_payment_note}</p>
                )}
              </div>
            </section>

            {/* Itens */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ingressos</h3>
              {ticketsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
              ) : !tickets || tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum ingresso vinculado.</p>
              ) : (
                <ul className="space-y-1.5">
                  {tickets.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-3 text-sm rounded-lg border bg-card/50 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5"><TicketIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> <span className="font-medium truncate">{t.lot?.name ?? 'Lote'}</span></div>
                        <p className="text-xs text-muted-foreground truncate">{t.holder_name}{t.seat_label ? ` · ${t.seat_label}` : ''}</p>
                      </div>
                      {t.status !== 'valid' && (
                        <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[t.status] ?? t.status}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Bloco financeiro — taxa aparece SÓ aqui, dentro do card do pedido */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financeiro deste pedido</h3>
              <div className="space-y-1.5 text-sm rounded-lg border bg-card/50 p-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Ingresso(s)</span><span>{brl(ingresso)}</span></div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-500">
                    <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />Desconto{order.event_coupons?.code ? ` (${order.event_coupons.code})` : ''}</span>
                    <span>−{brl(discount)}</span>
                  </div>
                )}
                {fee > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Taxa de conveniência</span><span>{brl(fee)}</span></div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1.5 mt-1.5"><span>Total pago</span><span>{brl(total)}</span></div>
              </div>
            </section>

            {/* Cancelamento */}
            {(canCancelManual || canCancelOnline) && (
              <section className="pt-2">
                {canCancelManual ? (
                  <Button
                    variant="outline"
                    onClick={() => setCancelOpen(true)}
                    className="w-full rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <XCircle className="h-4 w-4 mr-1.5" /> Cancelar pedido
                  </Button>
                ) : (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block w-full">
                          <Button variant="outline" disabled className="w-full rounded-lg">
                            <XCircle className="h-4 w-4 mr-1.5" /> Cancelar pedido
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        Cancelamento de pedido online — em breve. Reembolse pelo painel do Mercado Pago.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {canCancelManual && (
        <CancelManualSaleDialog
          orderId={order.id}
          eventId={order.event_id}
          open={cancelOpen}
          onOpenChange={(o) => { setCancelOpen(o); if (!o) onOpenChange(false); }}
        />
      )}
    </>
  );
}
