import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useCancelPaidOrder } from '@/hooks/useCancelPaidOrder';

interface Props {
  orderId: string;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled?: () => void; // sucesso → fechar o drawer também
}

export function CancelPaidOrderDialog({ orderId, eventId, open, onOpenChange, onCancelled }: Props) {
  const cancel = useCancelPaidOrder(eventId);

  const handleConfirm = async () => {
    try {
      await cancel.mutateAsync({ order_id: orderId });
      onOpenChange(false);
      onCancelled?.();
    } catch {
      /* toast tratado no hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!cancel.isPending) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancelar pedido pago
          </DialogTitle>
          <DialogDescription>
            Isso cancela o pedido e os ingressos (o estoque volta ao lote). O comprador deve ser
            avisado manualmente. <strong>O reembolso é manual e NÃO é feito aqui</strong> — nenhum
            estorno é disparado no Mercado Pago. Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cancel.isPending}>
            Manter pedido
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={cancel.isPending}>
            {cancel.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelando…</> : 'Cancelar pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
