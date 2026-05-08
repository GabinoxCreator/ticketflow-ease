import { Mail, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Order } from '@/hooks/useEventOrders';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrderListItemProps {
  order: Order;
  onUpdateStatus?: (orderId: string, status: Order['status']) => void;
}

export function OrderListItem({ order, onUpdateStatus }: OrderListItemProps) {
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

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-card/80 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h4 className="font-medium">{order.customer_name}</h4>
          {getStatusBadge()}
        </div>
        
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {order.customer_email}
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
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-semibold">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(order.total_amount))}
          </p>
          {order.payment_method && (
            <p className="text-xs text-muted-foreground">{order.payment_method}</p>
          )}
        </div>

        {/* Manual status mutation disabled in Parte 2.1 — these transitions
            must come from server-side flows (webhook MP, cron de expiração,
            reconciliação). Reativar exige endpoint dedicado com auditoria. */}
      </div>
    </div>
  );
}
