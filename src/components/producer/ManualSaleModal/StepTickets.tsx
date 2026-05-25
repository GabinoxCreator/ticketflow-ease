import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Minus, Plus, Loader2, Ticket } from 'lucide-react';
import { useEventLots } from '@/hooks/useEventLots';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AppliedCoupon {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
}

export interface TicketsState {
  quantities: Record<string, number>;
  couponCode: string;
  couponApplied: AppliedCoupon | null;
}

interface Props {
  eventId: string;
  value: TicketsState;
  onChange: (v: TicketsState) => void;
  onBack: () => void;
  onContinue: () => void;
}

const fmtBRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export function StepTickets({ eventId, value, onChange, onBack, onContinue }: Props) {
  const { lots, isLoading } = useEventLots(eventId);
  const [validating, setValidating] = useState(false);

  const activeLots = useMemo(
    () => (lots ?? []).filter((l) => l.is_active && !l.manually_sold_out),
    [lots],
  );

  // Ensure we never carry quantities for lots that disappeared
  useEffect(() => {
    if (!lots) return;
    const valid = new Set(lots.map((l) => l.id));
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(value.quantities)) {
      if (valid.has(k) && v > 0) clean[k] = v;
    }
    if (Object.keys(clean).length !== Object.keys(value.quantities).length) {
      onChange({ ...value, quantities: clean });
    }
  }, [lots]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = useMemo(() => {
    return (lots ?? []).reduce((s, l) => s + Number(l.price) * (value.quantities[l.id] || 0), 0);
  }, [lots, value.quantities]);

  const totalQty = Object.values(value.quantities).reduce((s, n) => s + (n || 0), 0);

  const discount = useMemo(() => {
    const c = value.couponApplied;
    if (!c) return 0;
    if (c.discount_type === 'percent') return Math.round((subtotal * c.discount_value) / 100 * 100) / 100;
    return Math.min(c.discount_value, subtotal);
  }, [value.couponApplied, subtotal]);

  const change = (lotId: string, delta: number, max: number) => {
    const curr = value.quantities[lotId] || 0;
    const next = Math.max(0, Math.min(max, curr + delta));
    onChange({ ...value, quantities: { ...value.quantities, [lotId]: next } });
  };

  const setQty = (lotId: string, raw: string, max: number) => {
    const n = Math.max(0, Math.min(max, parseInt(raw || '0', 10) || 0));
    onChange({ ...value, quantities: { ...value.quantities, [lotId]: n } });
  };

  const validateCoupon = async () => {
    const code = value.couponCode.trim();
    if (!code) return;
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-coupon', {
        body: { eventId, code },
      });
      if (error) throw new Error(error.message);
      if (!data?.valid) {
        toast.error(data?.message || 'Cupom inválido');
        onChange({ ...value, couponApplied: null });
        return;
      }
      onChange({
        ...value,
        couponApplied: {
          id: data.couponId,
          code: data.code,
          discount_type: data.discountType,
          discount_value: Number(data.discountValue),
        },
      });
      toast.success('Cupom aplicado!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao validar cupom');
    } finally {
      setValidating(false);
    }
  };

  const removeCoupon = () => onChange({ ...value, couponCode: '', couponApplied: null });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {activeLots.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">Nenhum lote ativo disponível.</div>
      ) : (
        <div className="space-y-2">
          {activeLots.map((lot) => {
            const avail = Math.max(0, lot.total_quantity - lot.sold_quantity - (lot.reserved_quantity || 0));
            const qty = value.quantities[lot.id] || 0;
            const disabled = avail === 0;
            return (
              <div
                key={lot.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-card/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Ticket className="h-4 w-4 text-primary flex-shrink-0" />
                    <p className="font-medium truncate">{lot.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtBRL(Number(lot.price))} · {disabled ? 'Esgotado' : `${avail} disponíveis`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => change(lot.id, -1, avail)} disabled={disabled || qty === 0}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Input
                    inputMode="numeric"
                    className="w-14 h-8 text-center px-1"
                    value={qty}
                    onChange={(e) => setQty(lot.id, e.target.value, avail)}
                    disabled={disabled}
                  />
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => change(lot.id, 1, avail)} disabled={disabled || qty >= avail}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cupom */}
      <div className="space-y-1.5">
        <Label>Cupom (opcional)</Label>
        {value.couponApplied ? (
          <div className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10">
            <div className="text-sm">
              <span className="font-mono font-semibold text-emerald-300">{value.couponApplied.code}</span>
              <span className="text-muted-foreground ml-2">
                {value.couponApplied.discount_type === 'percent'
                  ? `-${value.couponApplied.discount_value}%`
                  : `-${fmtBRL(value.couponApplied.discount_value)}`}
              </span>
            </div>
            <Button size="sm" variant="ghost" onClick={removeCoupon}>Remover</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Código do cupom"
              value={value.couponCode}
              onChange={(e) => onChange({ ...value, couponCode: e.target.value })}
            />
            <Button onClick={validateCoupon} variant="outline" disabled={validating || !value.couponCode.trim()}>
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validar'}
            </Button>
          </div>
        )}
      </div>

      {/* Resumo parcial (sem taxa - ela entra no passo 3) */}
      <div className="rounded-xl border border-primary/10 bg-background/40 p-3 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtBRL(subtotal)}</span></div>
        {discount > 0 && (
          <div className="flex justify-between text-emerald-400"><span>Desconto cupom</span><span>−{fmtBRL(discount)}</span></div>
        )}
        <div className="flex justify-between font-semibold pt-1 border-t border-border/40 mt-1">
          <span>Parcial</span><span>{fmtBRL(Math.max(0, subtotal - discount))}</span>
        </div>
        <p className="text-[11px] text-muted-foreground pt-1">A taxa de conveniência é definida no próximo passo.</p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onBack}>← Voltar</Button>
        <Button
          onClick={onContinue}
          disabled={totalQty === 0}
          className="bg-gradient-to-r from-primary to-pink-500 hover:opacity-90 text-white"
        >
          Continuar →
        </Button>
      </div>
    </div>
  );
}
