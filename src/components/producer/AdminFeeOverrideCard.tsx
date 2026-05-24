import { useEffect, useState } from 'react';
import { Shield, Save, RotateCcw, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Props {
  eventId: string;
  eventTitle?: string;
}

type Method = 'pix' | 'card';

interface OverrideRow {
  id: string;
  event_id: string;
  payment_method: Method;
  fee_percent: number;
  fee_fixed: number;
}

export function AdminFeeOverrideCard({ eventId, eventTitle }: Props) {
  const { userRole } = useAuth();
  const queryClient = useQueryClient();

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['event-fee-overrides-admin', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_fee_overrides' as any)
        .select('*')
        .eq('event_id', eventId);
      if (error) throw error;
      return (data || []) as unknown as OverrideRow[];
    },
    enabled: !!eventId && userRole === 'admin',
  });

  const [pixPercent, setPixPercent] = useState('10');
  const [pixFixed, setPixFixed] = useState('0');
  const [cardPercent, setCardPercent] = useState('10');
  const [cardFixed, setCardFixed] = useState('0');
  const [savingMethod, setSavingMethod] = useState<Method | null>(null);
  const [removingMethod, setRemovingMethod] = useState<Method | null>(null);

  useEffect(() => {
    const pix = overrides?.find((o) => o.payment_method === 'pix');
    const card = overrides?.find((o) => o.payment_method === 'card');
    setPixPercent(pix ? String(pix.fee_percent) : '10');
    setPixFixed(pix ? String(pix.fee_fixed) : '0');
    setCardPercent(card ? String(card.fee_percent) : '10');
    setCardFixed(card ? String(card.fee_fixed) : '0');
  }, [overrides]);

  if (userRole !== 'admin') return null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['event-fee-overrides-admin', eventId] });
    queryClient.invalidateQueries({ queryKey: ['event-fees', eventId] });
  };

  const save = async (method: Method, percent: string, fixed: string) => {
    const p = Number(percent);
    const f = Number(fixed);
    if (Number.isNaN(p) || p < 0 || p > 100) {
      toast.error('Taxa percentual inválida (0–100).');
      return;
    }
    if (Number.isNaN(f) || f < 0) {
      toast.error('Taxa fixa inválida.');
      return;
    }
    setSavingMethod(method);
    try {
      const { error } = await supabase
        .from('event_fee_overrides' as any)
        .upsert(
          {
            event_id: eventId,
            payment_method: method,
            fee_percent: p,
            fee_fixed: f,
          },
          { onConflict: 'event_id,payment_method' },
        );
      if (error) throw error;
      toast.success(`Taxa ${method === 'pix' ? 'PIX' : 'Cartão'} salva.`);
      invalidate();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar taxa.');
    } finally {
      setSavingMethod(null);
    }
  };

  const remove = async (method: Method) => {
    setRemovingMethod(method);
    try {
      const { error } = await supabase
        .from('event_fee_overrides' as any)
        .delete()
        .eq('event_id', eventId)
        .eq('payment_method', method);
      if (error) throw error;
      toast.success('Taxa restaurada para o padrão (10%).');
      invalidate();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao remover override.');
    } finally {
      setRemovingMethod(null);
    }
  };

  const hasPix = overrides?.some((o) => o.payment_method === 'pix');
  const hasCard = overrides?.some((o) => o.payment_method === 'card');

  return (
    <div className="relative rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-red-500/5 backdrop-blur-xl overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />
      <div className="p-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-orange-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base">Taxa da plataforma {eventTitle ? `· ${eventTitle}` : ''}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Visível apenas para Admin da plataforma. Padrão: 10%.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando…
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {/* PIX */}
            <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">PIX</p>
                {hasPix && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
                    Override ativo
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Taxa (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={pixPercent}
                    onChange={(e) => setPixPercent(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Taxa fixa (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pixFixed}
                    onChange={(e) => setPixFixed(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => save('pix', pixPercent, pixFixed)}
                  disabled={savingMethod === 'pix'}
                  className="flex-1"
                >
                  {savingMethod === 'pix' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" /> Salvar
                    </>
                  )}
                </Button>
                {hasPix && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove('pix')}
                    disabled={removingMethod === 'pix'}
                  >
                    {removingMethod === 'pix' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Cartão */}
            <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Cartão de Crédito</p>
                {hasCard && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
                    Override ativo
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Taxa (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={cardPercent}
                    onChange={(e) => setCardPercent(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Taxa fixa (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cardFixed}
                    onChange={(e) => setCardFixed(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => save('card', cardPercent, cardFixed)}
                  disabled={savingMethod === 'card'}
                  className="flex-1"
                >
                  {savingMethod === 'card' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" /> Salvar
                    </>
                  )}
                </Button>
                {hasCard && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove('card')}
                    disabled={removingMethod === 'card'}
                  >
                    {removingMethod === 'card' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
