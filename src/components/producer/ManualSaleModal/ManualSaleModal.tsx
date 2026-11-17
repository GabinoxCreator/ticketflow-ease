import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from '@/components/ui/dialog';
import { Event } from '@/hooks/useEvents';
import { StepBuyerData, BuyerData } from './StepBuyerData';
import { StepTickets, TicketsState } from './StepTickets';
import { StepPayment, PaymentState } from './StepPayment';
import { SuccessScreen } from './SuccessScreen';
import { CortesiaEmLote } from './CortesiaEmLote';
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
  // Cortesia: uma pessoa (os 3 passos de sempre) ou "Vários de uma vez" (OS-408 etapa 5, 5.1).
  const [modo, setModo] = useState<'uma' | 'lote'>('uma');
  // Enquanto o lote gera, a janela não fecha nem troca de modo (senão as linhas seguiriam
  // sendo geradas sem ninguém ver); com a lista final, a troca de modo some.
  const [estadoDoLote, setEstadoDoLote] = useState<'editando' | 'gerando' | 'pronto'>('editando');
  // Resposta perdida na venda/cortesia de uma pessoa: o confirmar fica parado até fechar a janela.
  const [semConfirmacao, setSemConfirmacao] = useState<string | null>(null);

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
        setModo('uma');
        setEstadoDoLote('editando');
        setSemConfirmacao(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const stepLabel = useMemo(() => {
    // Na cortesia quem recebe é convidado, não comprador (OS-408).
    if (step === 1) return courtesy ? 'Passo 1 de 3 — Convidado' : 'Passo 1 de 3 — Comprador';
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
      if (err?.semConfirmacao) setSemConfirmacao(err.message);
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
    <Dialog open={open} onOpenChange={(v) => { if (!v && estadoDoLote === 'gerando') return; onOpenChange(v); }}>
      <DialogContent className="max-w-xl sm:max-w-2xl w-[calc(100vw-1rem)] max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/40">
          <DialogTitle className="text-lg sm:text-xl">
            {step === 4
              ? (courtesy ? 'Cortesia gerada com sucesso!' : 'Venda registrada com sucesso!')
              : (courtesy ? 'Gerar cortesia' : 'Nova venda manual')}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {courtesy && modo === 'lote' ? 'Vários de uma vez' : step === 4 ? 'Confira o resumo e os próximos passos.' : stepLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          {courtesy && step === 1 && estadoDoLote === 'editando' && (
            <div role="radiogroup" aria-label="Quantas pessoas" className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-xl bg-muted/40 border border-border/60">
              {([['uma', 'Uma pessoa'], ['lote', 'Vários de uma vez']] as const).map(([v, nome]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={modo === v}
                  onClick={() => setModo(v)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${modo === v ? 'bg-gradient-to-r from-primary to-pink-500 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {nome}
                </button>
              ))}
            </div>
          )}
          {courtesy && modo === 'lote' && step === 1 && (
            <CortesiaEmLote eventId={event.id} onClose={() => onOpenChange(false)} onEstado={setEstadoDoLote} />
          )}
          {step === 1 && !(courtesy && modo === 'lote') && (
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
              semConfirmacao={semConfirmacao}
            />
          )}
          {step === 4 && result && (
            <SuccessScreen
              event={event}
              result={result}
              onClose={() => onOpenChange(false)}
              onNew={handleNewSale}
              courtesy={courtesy}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
