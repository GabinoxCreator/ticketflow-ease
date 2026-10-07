import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RecuperarPinDialog } from './RecuperarPinDialog';
import { mensagemDoPin, useMeuPin, type RespostaPin } from '@/lib/pinRepasse';

interface PinConfirmDialogProps {
  open: boolean;
  /** Uma das frases aprovadas (PIN_PARA_TROCAR_CONTA, PIN_PARA_TROCAR_DOCUMENTO). */
  descricao: string;
  onCancelar: () => void;
  /**
   * Faz a troca no servidor com o PIN digitado. Quem confere o PIN é o banco;
   * esta janela só mostra a resposta. `ok:true` fecha.
   */
  onConfirmar: (pin: string) => Promise<RespostaPin>;
}

/** Pede o PIN para uma troca que mexe no repasse (OS-166). */
export function PinConfirmDialog({ open, descricao, onCancelar, onConfirmar }: PinConfirmDialogProps) {
  const { data: meuPin } = useMeuPin();
  const [pin, setPin] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [esqueci, setEsqueci] = useState(false);

  useEffect(() => {
    if (open) { setPin(''); setErro(''); setMostrar(false); }
  }, [open]);

  const confirmar = async () => {
    if (pin.length !== 4) { setErro('O PIN deve ter 4 dígitos'); return; }
    setEnviando(true);
    setErro('');
    const r = await onConfirmar(pin);
    setEnviando(false);
    if (!r.ok) {
      setErro(mensagemDoPin(r.error));
      setPin('');
    }
  };

  return (
    <>
      <Dialog open={open && !esqueci} onOpenChange={(v) => { if (!v && !enviando) onCancelar(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-center mb-2">
              <div className="p-3 rounded-full bg-primary/10">
                <Lock className="w-7 h-7 text-primary" />
              </div>
            </div>
            <DialogTitle className="text-center">PIN de segurança</DialogTitle>
            <DialogDescription className="text-center">{descricao}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="relative">
              <Input
                type={mostrar ? 'text' : 'password'}
                inputMode="numeric"
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setErro(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && pin.length === 4 && !enviando) confirmar(); }}
                placeholder="••••"
                maxLength={4}
                className="text-center text-2xl tracking-widest pr-10"
                autoFocus
                aria-label="PIN"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setMostrar(!mostrar)}
                aria-label={mostrar ? 'Esconder PIN' : 'Mostrar PIN'}
              >
                {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>

            {erro && <p className="text-sm text-destructive text-center">{erro}</p>}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onCancelar} disabled={enviando}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={confirmar} disabled={enviando || pin.length !== 4}>
                {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Confirmar
              </Button>
            </div>

            <button
              type="button"
              className="w-full text-sm text-primary hover:underline"
              onClick={() => setEsqueci(true)}
              disabled={enviando}
            >
              Esqueceu o PIN?
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <RecuperarPinDialog
        open={open && esqueci}
        onOpenChange={(v) => { if (!v) setEsqueci(false); }}
        emailMascarado={meuPin?.email_recuperacao ?? null}
      />
    </>
  );
}
