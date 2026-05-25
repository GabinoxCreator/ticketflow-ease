import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useCancelManualSale } from '@/hooks/useCancelManualSale';

interface Props {
  orderId: string;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CancelManualSaleDialog({ orderId, eventId, open, onOpenChange }: Props) {
  const [reason, setReason] = useState('');
  const cancel = useCancelManualSale(eventId);

  const handleConfirm = async () => {
    if (reason.trim().length < 5) return;
    try {
      await cancel.mutateAsync({ order_id: orderId, reason: reason.trim() });
      onOpenChange(false);
      setReason('');
    } catch {
      /* toast handled by hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!cancel.isPending) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancelar venda manual
          </DialogTitle>
          <DialogDescription>
            Esta ação <strong>não pode ser desfeita</strong>. O comprador deve ser avisado manualmente
            (não enviamos email de cancelamento). Os ingressos serão invalidados e o estoque devolvido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <label className="text-sm font-medium" htmlFor="cancel-reason">Motivo do cancelamento *</label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Comprador desistiu e foi reembolsado por PIX."
            maxLength={500}
            className="min-h-[100px]"
          />
          {reason.trim().length > 0 && reason.trim().length < 5 && (
            <p className="text-xs text-destructive">Mínimo 5 caracteres.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={cancel.isPending}>
            Manter venda
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={cancel.isPending || reason.trim().length < 5}
          >
            {cancel.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelando…</> : 'Cancelar venda'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
