import { MoreHorizontal, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Order } from '@/hooks/useEventOrders';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrderListItemProps {
  order: Order;
  onUpdateStatus: (orderId: string, status: Order['status']) => void;
}

export function OrderListItem({ order, onUpdateStatus }: OrderListItemProps) {
  const getStatusBadge = () => {
    switch (order.status) {
      case 'paid':
        return <Badge className="bg-green-500 hover:bg-green-600">Pago</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pendente</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelado</Badge>;
      case 'refunded':
        return <Badge variant="outline">Reembolsado</Badge>;
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {order.status === 'pending' && (
              <DropdownMenuItem onClick={() => onUpdateStatus(order.id, 'paid')}>
                Marcar como Pago
              </DropdownMenuItem>
            )}
            {order.status === 'paid' && (
              <DropdownMenuItem onClick={() => onUpdateStatus(order.id, 'refunded')}>
                Reembolsar
              </DropdownMenuItem>
            )}
            {(order.status === 'pending' || order.status === 'paid') && (
              <DropdownMenuItem 
                onClick={() => onUpdateStatus(order.id, 'cancelled')}
                className="text-destructive"
              >
                Cancelar Pedido
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
