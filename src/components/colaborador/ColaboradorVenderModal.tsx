import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ShoppingBag, Minus, Plus, QrCode, Banknote, CreditCard, ArrowLeft, Loader2 } from 'lucide-react';
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

export default function ColaboradorVenderModal({
  open, onOpenChange, eventId, collaboratorId, sessionToken, onSessionExpired, onSaleComplete,
}: Props) {
  const { lots, isLoading } = useEventLots(eventId);
  const register = useRegisterDoorSale(collaboratorId, sessionToken, onSessionExpired);

  const [step, setStep] = useState<1 | 2>(1);
  const [lotId, setLotId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('');

  const activeLots = (lots || []).filter(l => l.is_active);
  const selectedLot = activeLots.find(l => l.id === lotId);
  const available = selectedLot
    ? selectedLot.total_quantity - selectedLot.sold_quantity - selectedLot.reserved_quantity
    : 0;
  const totalAmount = selectedLot ? Number(selectedLot.price) * quantity : 0;

  const reset = () => {
    setStep(1); setLotId(''); setQuantity(1); setPaymentMethod('');
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
      toast.success(`Venda registrada: ${quantity}x ${selectedLot?.name}`);
      onSaleComplete();
      handleClose(false);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao registrar venda');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            Venda na Portaria
          </DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Selecione o lote e quantidade.' : 'Escolha o meio de pagamento.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lote / Ingresso</Label>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : activeLots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lote ativo.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {activeLots.map(lot => {
                    const av = lot.total_quantity - lot.sold_quantity - lot.reserved_quantity;
                    const selected = lot.id === lotId;
                    const soldOut = av <= 0;
                    return (
                      <button
                        key={lot.id}
                        type="button"
                        disabled={soldOut}
                        onClick={() => { setLotId(lot.id); setQuantity(1); }}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                          selected
                            ? 'border-emerald-500 bg-emerald-50'
                            : soldOut
                              ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                              : 'border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="font-semibold text-slate-900">{lot.name}</div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {formatBRL(Number(lot.price))} · {soldOut ? 'Esgotado' : `${av} disponíveis`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedLot && (
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <div className="flex items-center gap-2 justify-center">
                  <Button
                    variant="outline" size="icon"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={e => {
                      const v = parseInt(e.target.value) || 1;
                      setQuantity(Math.max(1, Math.min(available, v)));
                    }}
                    className="w-20 text-center text-lg font-bold border rounded-md h-10"
                  />
                  <Button
                    variant="outline" size="icon"
                    onClick={() => setQuantity(q => Math.min(available, q + 1))}
                    disabled={quantity >= available}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={!lotId || quantity < 1}
                onClick={() => setStep(2)}
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {step === 2 && selectedLot && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="text-sm text-slate-700">{quantity}x {selectedLot.name}</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{formatBRL(totalAmount)}</div>
            </div>

            <div className="space-y-2">
              <Label>Meio de Pagamento</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(({ id, label, Icon }) => {
                  const selected = paymentMethod === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPaymentMethod(id)}
                      className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                        selected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${selected ? 'text-emerald-600' : 'text-slate-600'}`} />
                      <span className={`text-sm font-medium ${selected ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
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
      </DialogContent>
    </Dialog>
  );
}
