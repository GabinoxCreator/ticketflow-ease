import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from '@/components/ui/dialog';
import { Event } from '@/hooks/useEvents';
import { StepBuyerData, BuyerData } from './StepBuyerData';
import { StepTickets, TicketsState } from './StepTickets';
import { StepPayment, PaymentState } from './StepPayment';
import { SuccessScreen } from './SuccessScreen';
import { useManualSale, ManualSaleResult } from '@/hooks/useManualSale';
import { unformatCPF } from '@/utils/cpfValidator';
import { toast } from 'sonner';

interface Props {
  event: Pick<Event, 'id' | 'producer_id' | 'title' | 'date' | 'time' | 'venue' | 'city' | 'state'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Modo cortesia: mesmo fluxo, sem método/taxa/cupom, valor zero. is_courtesy=true no envio.
  courtesy?: boolean;
}

type Step = 1 | 2 | 3 | 4;

const emptyBuyer: BuyerData = { name: '', cpf: '', email: '', whatsapp: '' };
const emptyTickets: TicketsState = { quantities: {}, couponCode: '', couponApplied: null };
const emptyPayment: PaymentState = { method: 'pix', applyFee: false, note: '' };

export function ManualSaleModal({ event, open, onOpenChange, courtesy = false }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [buyer, setBuyer] = useState<BuyerData>(emptyBuyer);
  const [tickets, setTickets] = useState<TicketsState>(emptyTickets);
  const [payment, setPayment] = useState<PaymentState>(emptyPayment);
  const [result, setResult] = useState<ManualSaleResult | null>(null);

  const mutation = useManualSale(event.id);

  // Reset on close
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep(1);
        setBuyer(emptyBuyer);
        setTickets(emptyTickets);
        setPayment(emptyPayment);
        setResult(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const stepLabel = useMemo(() => {
    if (step === 1) return 'Passo 1 de 3 — Comprador';
    if (step === 2) return 'Passo 2 de 3 — Ingressos';
    if (step === 3) return courtesy ? 'Passo 3 de 3 — Cortesia' : 'Passo 3 de 3 — Pagamento';
    return courtesy ? 'Cortesia registrada' : 'Venda registrada';
  }, [step, courtesy]);

  const handleConfirm = async () => {
    const items = Object.entries(tickets.quantities)
      .filter(([, q]) => q > 0)
      .map(([lot_id, quantity]) => ({ lot_id, quantity }));
    if (items.length === 0) return;
    try {
      const buyerPayload = {
        name: buyer.name.trim(),
        cpf: unformatCPF(buyer.cpf),
        email: buyer.email.trim().toLowerCase(),
        whatsapp: buyer.whatsapp ? buyer.whatsapp.replace(/\D/g, '') : null,
      };
      // Cortesia: NÃO manda cupom/método/taxa (o servidor força zero de qualquer forma).
      const res = await mutation.mutateAsync(
        courtesy
          ? {
              event_id: event.id,
              buyer: buyerPayload,
              items,
              is_courtesy: true,
              note: payment.note?.trim() || null,
            }
          : {
              event_id: event.id,
              buyer: buyerPayload,
              items,
              coupon_code: tickets.couponApplied?.code ?? null,
              payment_method: payment.method,
              apply_fee: payment.applyFee,
              note: payment.note?.trim() || null,
            },
      );
      setResult(res);
      setStep(4);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar venda manual');
    }
  };

  const handleNewSale = () => {
    setBuyer(emptyBuyer);
    setTickets(emptyTickets);
    setPayment(emptyPayment);
    setResult(null);
    setStep(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl sm:max-w-2xl w-[calc(100vw-1rem)] max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/40">
          <DialogTitle className="text-lg sm:text-xl">
            {step === 4
              ? (courtesy ? 'Cortesia gerada com sucesso!' : 'Venda registrada com sucesso!')
              : (courtesy ? 'Gerar cortesia' : 'Nova venda manual')}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {step === 4 ? 'Confira o resumo e os próximos passos.' : stepLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          {step === 1 && (
            <StepBuyerData
              eventId={event.id}
              value={buyer}
              onChange={setBuyer}
              onCancel={() => onOpenChange(false)}
              onContinue={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepTickets
              eventId={event.id}
              value={tickets}
              onChange={setTickets}
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
              courtesy={courtesy}
            />
          )}
          {step === 3 && (
            <StepPayment
              eventId={event.id}
              buyer={buyer}
              tickets={tickets}
              value={payment}
              onChange={setPayment}
              onBack={() => setStep(2)}
              onConfirm={handleConfirm}
              isSubmitting={mutation.isPending}
              courtesy={courtesy}
            />
          )}
          {step === 4 && result && (
            <SuccessScreen
              event={event}
              result={result}
              onClose={() => onOpenChange(false)}
              onNew={handleNewSale}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
