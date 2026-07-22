import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEventLots } from '@/hooks/useEventLots';
import { BuyerData } from './StepBuyerData';
import { TicketsState } from './StepTickets';
import { PAYMENT_METHOD_LABELS } from './utils';

export interface PaymentState {
  method: 'pix' | 'dinheiro' | 'transferencia' | 'cartao' | 'outro';
  applyFee: boolean;
  note: string;
}

interface Props {
  eventId: string;
  buyer: BuyerData;
  tickets: TicketsState;
  value: PaymentState;
  onChange: (v: PaymentState) => void;
  onBack: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  courtesy?: boolean;
}

const fmtBRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const METHODS: PaymentState['method'][] = ['pix', 'dinheiro', 'transferencia', 'cartao', 'outro'];

export function StepPayment({ eventId, buyer, tickets, value, onChange, onBack, onConfirm, isSubmitting, courtesy = false }: Props) {
  const { lots } = useEventLots(eventId);
  const [feeData, setFeeData] = useState<{ percent: number; fixed: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_event_fee', { _event_id: eventId, _method: 'pix' });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      setFeeData({
        percent: Number(row?.fee_percent ?? 10),
        fixed: Number(row?.fee_fixed ?? 0),
      });
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  const lineItems = useMemo(() => {
    return Object.entries(tickets.quantities)
      .filter(([, q]) => q > 0)
      .map(([lot_id, quantity]) => {
        const lot = lots?.find((l) => l.id === lot_id);
        return {
          lot_id,
          lot_name: lot?.name ?? '—',
          quantity,
          price: Number(lot?.price ?? 0),
        };
      });
  }, [tickets.quantities, lots]);

  const subtotal = lineItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = (() => {
    const c = tickets.couponApplied;
    if (!c) return 0;
    if (c.discount_type === 'percent') return Math.round((subtotal * c.discount_value) / 100 * 100) / 100;
    return Math.min(c.discount_value, subtotal);
  })();
  const serviceFee = !courtesy && value.applyFee && feeData
    ? Math.max(0, Math.round((subtotal * feeData.percent / 100 + feeData.fixed) * 100) / 100)
    : 0;
  const total = courtesy ? 0 : Math.max(0.01, Math.round((subtotal + serviceFee - discount) * 100) / 100);

  return (
    <div className="space-y-5">
      {courtesy && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-sm">
          <p className="font-medium text-orange-300">Ingresso cortesia</p>
          <p className="text-xs text-muted-foreground mt-0.5">Sem cobrança — valor R$ 0,00, fora da receita. Sem método de pagamento nem taxa.</p>
        </div>
      )}

      {!courtesy && (
      <div>
        <Label className="text-sm">Método de pagamento recebido</Label>
        <RadioGroup
          value={value.method}
          onValueChange={(v) => onChange({ ...value, method: v as PaymentState['method'] })}
          className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2"
        >
          {METHODS.map((m) => (
            <label
              key={m}
              htmlFor={`pm-${m}`}
              className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border cursor-pointer text-sm transition ${
                value.method === m
                  ? 'border-primary bg-primary/10'
                  : 'border-border/60 bg-card/40 hover:bg-card/60'
              }`}
            >
              <RadioGroupItem id={`pm-${m}`} value={m} className="sr-only" />
              <span>{PAYMENT_METHOD_LABELS[m]}</span>
            </label>
          ))}
        </RadioGroup>
      </div>
      )}

      {!courtesy && (
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 flex items-start gap-3">
        <Switch
          id="apply-fee"
          checked={value.applyFee}
          onCheckedChange={(v) => onChange({ ...value, applyFee: v })}
        />
        <div className="flex-1 min-w-0">
          <Label htmlFor="apply-fee" className="cursor-pointer">Cobrar taxa de conveniência?</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Em vendas manuais você já recebeu o pagamento fora da plataforma. Ative apenas se quiser repassar a taxa ao comprador.
            {feeData && value.applyFee && (
              <span className="ml-1">
                ({feeData.percent}% {feeData.fixed > 0 ? `+ ${fmtBRL(feeData.fixed)}` : ''})
              </span>
            )}
          </p>
        </div>
      </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ms-note">Observação interna <span className="text-muted-foreground">(opcional)</span></Label>
        <Textarea
          id="ms-note"
          maxLength={500}
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          placeholder="Ex: Ana pagou via PIX dia 23/05, comprovante no WhatsApp"
          className="min-h-[80px]"
        />
      </div>

      {/* Resumo final */}
      <div className="rounded-xl border border-primary/10 bg-background/40 p-3 text-sm space-y-2">
        <div>
          <p className="text-muted-foreground text-xs">Comprador</p>
          <p>{buyer.name} <span className="text-muted-foreground">({buyer.cpf})</span></p>
          <p className="text-xs text-muted-foreground">{buyer.email}{buyer.whatsapp ? ` · ${buyer.whatsapp}` : ''}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs mb-1">Ingressos</p>
          {lineItems.map((i) => (
            <div key={i.lot_id} className="flex justify-between text-xs">
              <span>{i.quantity}x {i.lot_name}</span>
              <span>{fmtBRL(i.price * i.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-border/40 space-y-0.5">
          {!courtesy && (
            <>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal</span><span>{fmtBRL(subtotal)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Taxa conveniência</span><span>{fmtBRL(serviceFee)}</span></div>
              {discount > 0 && <div className="flex justify-between text-xs text-emerald-400"><span>Desconto cupom</span><span>−{fmtBRL(discount)}</span></div>}
            </>
          )}
          <div className="flex justify-between font-semibold pt-1 border-t border-border/40 mt-1">
            <span>{courtesy ? 'Total' : 'Total cobrado'}</span><span>{fmtBRL(total)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            {courtesy ? 'Cortesia — sem cobrança.' : `Pagamento: ${PAYMENT_METHOD_LABELS[value.method]} (recebido)`}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>← Voltar</Button>
        <Button
          onClick={onConfirm}
          disabled={isSubmitting}
          className="bg-gradient-to-r from-primary to-pink-500 hover:opacity-90 text-white"
        >
          {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando…</> : (courtesy ? '✓ Gerar cortesia' : '✓ Confirmar e gerar ingressos')}
        </Button>
      </div>
    </div>
  );
}
