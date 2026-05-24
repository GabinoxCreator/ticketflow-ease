import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  ShoppingBag, Minus, Plus, QrCode, Banknote, CreditCard, ArrowLeft, Loader2, CheckCircle2,
} from 'lucide-react';
import { useEventLots } from '@/hooks/useEventLots';
import { useRegisterDoorSale } from '@/hooks/useColaboradorDoorSales';
import { toast } from 'sonner';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
  onSaleComplete: () => void;
}

const PAYMENT_METHODS = [
  { id: 'pix', label: 'PIX', Icon: QrCode },
  { id: 'dinheiro', label: 'Dinheiro', Icon: Banknote },
  { id: 'cartao_debito', label: 'Cartão Débito', Icon: CreditCard },
  { id: 'cartao_credito', label: 'Cartão Crédito', Icon: CreditCard },
];

const QUICK_QTYS = [1, 2, 5, 10];

const METHOD_LABEL: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao_debito: 'Cartão Débito', cartao_credito: 'Cartão Crédito',
};

export default function ColaboradorVenderModal({
  open, onOpenChange, eventId, collaboratorId, sessionToken, onSessionExpired, onSaleComplete,
}: Props) {
  const { lots, isLoading } = useEventLots(eventId);
  const register = useRegisterDoorSale(collaboratorId, sessionToken, onSessionExpired);

  const [step, setStep] = useState<1 | 2>(1);
  const [lotId, setLotId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [success, setSuccess] = useState(false);

  const activeLots = (lots || []).filter(l => l.is_active);
  const selectedLot = activeLots.find(l => l.id === lotId);
  const available = selectedLot
    ? selectedLot.total_quantity - selectedLot.sold_quantity - selectedLot.reserved_quantity
    : 0;
  const totalAmount = selectedLot ? Number(selectedLot.price) * quantity : 0;

  const reset = () => {
    setStep(1); setLotId(''); setQuantity(1); setPaymentMethod(''); setSuccess(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (!lotId || !paymentMethod) return;
    try {
      await register.mutateAsync({
        event_id: eventId, lot_id: lotId, quantity, payment_method: paymentMethod,
      });
      setSuccess(true);
      toast.success(`Venda registrada: ${quantity}x ${selectedLot?.name}`);
      onSaleComplete();
      setTimeout(() => handleClose(false), 1500);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao registrar venda');
    }
  };

  const setQtyBounded = (v: number) =>
    setQuantity(Math.max(1, Math.min(available || v, v)));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-white border-slate-200 text-slate-900 p-0 overflow-hidden">
        {success ? (
          <div className="p-8 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Venda registrada!</h2>
            <p className="text-sm text-slate-500 mt-1">
              {quantity}x {selectedLot?.name} · {METHOD_LABEL[paymentMethod]}
            </p>
            <p className="text-3xl font-extrabold text-emerald-600 mt-4 tabular-nums">
              {formatBRL(totalAmount)}
            </p>
          </div>
        ) : (
          <>
            <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100">
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <ShoppingBag className="w-5 h-5 text-emerald-600" />
                Venda na Portaria
              </DialogTitle>
              <DialogDescription className="text-slate-500">
                {step === 1 ? 'Selecione o lote e quantidade.' : 'Escolha o meio de pagamento.'}
              </DialogDescription>
            </DialogHeader>

            {/* Sticky summary */}
            {selectedLot && (
              <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-emerald-700/80 uppercase tracking-wider font-semibold">
                    Resumo
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {quantity}x {selectedLot.name}
                  </div>
                </div>
                <div className="text-xl font-extrabold text-emerald-700 tabular-nums whitespace-nowrap">
                  {formatBRL(totalAmount)}
                </div>
              </div>
            )}

            <div className="px-6 py-5">
              {step === 1 && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-slate-700">Lote / Ingresso</Label>
                    {isLoading ? (
                      <p className="text-sm text-slate-500">Carregando...</p>
                    ) : activeLots.length === 0 ? (
                      <p className="text-sm text-slate-500">Nenhum lote ativo.</p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {activeLots.map(lot => {
                          const av = lot.total_quantity - lot.sold_quantity - lot.reserved_quantity;
                          const selected = lot.id === lotId;
                          const soldOut = av <= 0 || (lot as any).manually_sold_out === true;
                          return (
                            <button
                              key={lot.id}
                              type="button"
                              disabled={soldOut}
                              onClick={() => { setLotId(lot.id); setQuantity(1); }}
                              className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                                selected
                                  ? 'border-emerald-500 bg-emerald-50'
                                  : soldOut
                                    ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                                    : 'border-slate-200 bg-white hover:border-emerald-300'
                              }`}
                            >
                              <div className="font-semibold text-slate-900">{lot.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {formatBRL(Number(lot.price))} · {soldOut ? 'Esgotado' : `${av} disponíveis`}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {selectedLot && (
                    <div className="space-y-3">
                      <Label className="text-slate-700">Quantidade</Label>
                      <div className="flex items-center gap-3 justify-center">
                        <button
                          type="button"
                          onClick={() => setQuantity(q => Math.max(1, q - 1))}
                          disabled={quantity <= 1}
                          className="w-14 h-14 rounded-xl border-2 border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:border-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                          <Minus className="w-6 h-6" />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={quantity}
                          onChange={e => {
                            const v = parseInt(e.target.value) || 1;
                            setQtyBounded(v);
                          }}
                          className="w-24 h-14 text-center text-2xl font-bold border-2 border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => setQuantity(q => Math.min(available, q + 1))}
                          disabled={quantity >= available}
                          className="w-14 h-14 rounded-xl border-2 border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:border-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                          <Plus className="w-6 h-6" />
                        </button>
                      </div>
                      <div className="flex gap-2 justify-center pt-1">
                        {QUICK_QTYS.map(n => {
                          const disabled = n > available;
                          const active = quantity === n;
                          return (
                            <button
                              key={n}
                              type="button"
                              disabled={disabled}
                              onClick={() => setQtyBounded(n)}
                              className={`min-w-[52px] h-10 px-3 rounded-full text-sm font-semibold border transition ${
                                active
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed'
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-400 text-center">
                        {available} disponíveis no lote
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1 h-12 border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => handleClose(false)}>
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      disabled={!lotId || quantity < 1}
                      onClick={() => setStep(2)}
                    >
                      Continuar
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && selectedLot && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-slate-700">Meio de Pagamento</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {PAYMENT_METHODS.map(({ id, label, Icon }) => {
                        const selected = paymentMethod === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setPaymentMethod(id)}
                            className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                              selected
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'border-slate-200 bg-white hover:border-emerald-300'
                            }`}
                          >
                            <Icon className={`w-7 h-7 ${selected ? 'text-emerald-600' : 'text-slate-500'}`} />
                            <span className={`text-sm font-semibold ${selected ? 'text-emerald-700' : 'text-slate-700'}`}>
                              {label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1 h-12 border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setStep(1)}>
                      <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                    </Button>
                    <Button
                      className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      disabled={!paymentMethod || register.isPending}
                      onClick={handleConfirm}
                    >
                      {register.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <ShoppingBag className="w-4 h-4 mr-1" />
                      )}
                      Confirmar Venda
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
