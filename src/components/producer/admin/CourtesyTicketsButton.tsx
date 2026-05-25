import { useState, useMemo } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useEventLots } from '@/hooks/useEventLots';
import { supabase } from '@/integrations/supabase/client';
import { Event } from '@/hooks/useEvents';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { generateManualSaleTicketsPDF } from '@/utils/manualSaleTicketsPdf';

interface Props {
  event: Pick<Event, 'id' | 'title' | 'date' | 'time' | 'venue' | 'city' | 'state'>;
}

export function CourtesyTicketsButton({ event }: Props) {
  const { userRole, user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [lotId, setLotId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [holderName, setHolderName] = useState<string>('Cortesia');
  const [holderEmail, setHolderEmail] = useState<string>(user?.email ?? '');
  const [holderPhone, setHolderPhone] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const { lots } = useEventLots(event.id);

  const availableLots = useMemo(() => {
    return (lots ?? [])
      .filter((l) => l.is_active && !l.manually_sold_out)
      .map((l) => ({
        id: l.id,
        name: l.name,
        available: Math.max(0, l.total_quantity - l.sold_quantity - (l.reserved_quantity || 0)),
      }));
  }, [lots]);

  const selectedLot = availableLots.find((l) => l.id === lotId);
  const maxQty = Math.min(100, selectedLot?.available ?? 0);

  if (userRole !== 'admin') return null;

  const handleSubmit = async () => {
    if (!lotId) return toast.error('Selecione um lote');
    if (quantity < 1 || quantity > maxQty) return toast.error(`Quantidade entre 1 e ${maxQty}`);
    if (!holderName.trim()) return toast.error('Informe o nome do portador');
    if (!/^\S+@\S+\.\S+$/.test(holderEmail)) return toast.error('E-mail inválido');

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-generate-courtesy-tickets', {
        body: {
          event_id: event.id,
          lot_id: lotId,
          quantity,
          holder_name: holderName.trim(),
          holder_email: holderEmail.trim().toLowerCase(),
          holder_phone: holderPhone.replace(/\D/g, '') || null,
        },
      });

      if (error) throw new Error(error.message || 'Falha na geração');
      if (!data?.ok) throw new Error(data?.error || 'Falha na geração');

      const tickets = (data.tickets || []) as Array<{ ticket_code: string; lot_name: string; holder_name: string }>;

      await generateManualSaleTicketsPDF(
        tickets.map((t) => ({
          ticket_code: t.ticket_code,
          lot_name: t.lot_name,
          holder_name: t.holder_name,
        })),
        {
          title: event.title,
          date: event.date,
          time: event.time,
          venue: event.venue,
          city: event.city,
          state: event.state,
        }
      );

      toast.success(`${tickets.length} ingresso(s) cortesia gerado(s)`);

      // Refresh dashboards
      queryClient.invalidateQueries({ queryKey: ['event-orders', event.id] });
      queryClient.invalidateQueries({ queryKey: ['event-lots', event.id] });
      queryClient.invalidateQueries({ queryKey: ['event-participants', event.id] });
      queryClient.invalidateQueries({ queryKey: ['event-financeiro', event.id] });

      setOpen(false);
      setQuantity(1);
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro inesperado');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90 text-white shadow-lg shadow-orange-500/20"
        title="Apenas admin"
      >
        <Gift className="h-4 w-4 mr-2" />
        Cortesia (Admin)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar ingressos cortesia</DialogTitle>
            <DialogDescription>
              Apenas admin. Conta como ingressos saídos, mas não entra na receita.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lote</Label>
              <Select value={lotId} onValueChange={(v) => { setLotId(v); setQuantity(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um lote" />
                </SelectTrigger>
                <SelectContent>
                  {availableLots.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground">Nenhum lote disponível</div>
                  )}
                  {availableLots.map((l) => (
                    <SelectItem key={l.id} value={l.id} disabled={l.available <= 0}>
                      {l.name} — {l.available} disponíveis
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                max={maxQty || 1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, parseInt(e.target.value || '1', 10))))}
                disabled={!lotId}
              />
              {selectedLot && (
                <p className="text-xs text-muted-foreground">Máx: {maxQty}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Nome do portador</Label>
              <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={holderEmail} onChange={(e) => setHolderEmail(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>WhatsApp (opcional)</Label>
              <Input value={holderPhone} onChange={(e) => setHolderPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !lotId || quantity < 1}
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90 text-white"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...</>
              ) : (
                <><Gift className="h-4 w-4 mr-2" /> Gerar e baixar PDF</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
