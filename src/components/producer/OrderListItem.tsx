import { useState } from 'react';
import { Mail, Phone, XCircle, Receipt, Gift, AlertTriangle, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Order } from '@/hooks/useEventOrders';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CancelManualSaleDialog } from '@/components/producer/CancelManualSaleDialog';
interface OrderListItemProps {
  order: Order;
  onUpdateStatus?: (orderId: string, status: Order['status']) => void;
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

export function OrderListItem({ order }: OrderListItemProps) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const isManual = order.sale_origin === 'manual';
  const isCourtesy = order.sale_origin === 'courtesy';
  const canCancel = isManual && (order.status === 'paid' || order.status === 'completed');

  const getStatusBadge = () => {
    switch (order.status) {
      case 'paid':
      case 'completed':
        return <Badge className="bg-green-500 hover:bg-green-600">Pago</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pendente</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelado</Badge>;
      case 'refunded':
        return <Badge variant="outline">Reembolsado</Badge>;
      case 'failed':
        return <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">Falhou</Badge>;
      case 'expired':
        return <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">Expirado</Badge>;
      case 'charged_back':
        return <Badge variant="outline" className="border-orange-500/40 text-orange-500">Chargeback</Badge>;
      default:
        return null;
    }
  };

  const paymentLabel = order.manual_payment_method
    ? PAYMENT_LABELS[order.manual_payment_method] ?? order.manual_payment_method
    : null;

  const discountAmount = Number(order.discount_amount || 0);
  const couponCode = order.event_coupons?.code;
  const hasDiscount = discountAmount > 0;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border bg-card hover:bg-card/80 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h4 className="font-medium">{order.customer_name}</h4>
          {getStatusBadge()}
          {isManual && (
            <Badge className="bg-primary/15 text-primary border border-primary/30 hover:bg-primary/20">
              <Receipt className="h-3 w-3 mr-1" /> Manual
            </Badge>
          )}
          {isCourtesy && (
            <Badge className="bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20">
              <Gift className="h-3 w-3 mr-1" /> Cortesia
            </Badge>
          )}
          {order.review_status && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="bg-red-500/15 text-red-400 border border-red-500/40 hover:bg-red-500/25 cursor-help">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Revisar pagamento
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                  {order.review_status === 'partial_delivery' ? (
                    <>
                      <strong className="text-red-400">Entrega parcial.</strong> Pagamento confirmado, mas só{' '}
                      {order.review_reason?.delivered ?? '?'} de {order.review_reason?.expected ?? '?'} assentos foram entregues. Verifique no Mercado Pago e reembolse a diferença manualmente se necessário.
                    </>
                  ) : (
                    <>
                      <strong className="text-red-400">Pago sem entrega.</strong> Pagamento confirmado no Mercado Pago, mas o pedido já estava {order.review_reason?.order_status ?? 'encerrado'} quando o webhook chegou. Nenhum assento foi entregue. Verifique e reembolse manualmente no painel do MP.
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-1 min-w-0">
            <Mail className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{order.customer_email}</span>
          </div>
          {order.customer_phone && (
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {order.customer_phone}
            </div>
          )}
          <span>
            {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </span>
        </div>

        {hasDiscount && (
          <div className="mt-1.5">
            <Badge className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 font-normal">
              <Tag className="h-3 w-3 mr-1" />
              {couponCode ? `Cupom ${couponCode} · ` : 'Desconto '}
              −{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(discountAmount)}
            </Badge>
          </div>
        )}

        {isManual && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {paymentLabel && (
              <span><strong className="text-foreground/80">Pagamento:</strong> {paymentLabel}</span>
            )}
            <span>
              <strong className="text-foreground/80">Taxa aplicada:</strong>{' '}
              {order.manual_fee_applied ? 'Sim' : 'Não'}
            </span>
            {order.manual_payment_note && (
              <span className="basis-full break-words">
                <strong className="text-foreground/80">Nota:</strong> {order.manual_payment_note}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 sm:gap-4 justify-between sm:justify-end">
        <div className="text-right">
          <p className="font-semibold">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(order.total_amount))}
          </p>
          {!isManual && order.payment_method && (
            <p className="text-xs text-muted-foreground">{order.payment_method}</p>
          )}
        </div>

        {canCancel && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelOpen(true)}
              className="rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <XCircle className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Cancelar</span>
            </Button>
            <CancelManualSaleDialog
              orderId={order.id}
              eventId={order.event_id}
              open={cancelOpen}
              onOpenChange={setCancelOpen}
            />
          </>
        )}
      </div>
    </div>
  );
}
