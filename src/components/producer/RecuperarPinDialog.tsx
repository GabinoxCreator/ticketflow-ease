import { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  EMAIL_SUPORTE,
  atualizarMeuPin,
  mensagemDaRecuperacao,
  recuperarPin,
} from '@/lib/pinRepasse';

interface RecuperarPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** E-mail guardado no PIN, já mascarado (vem do meu_pin). */
  emailMascarado: string | null;
  /** Chamado quando o PIN novo foi gravado. */
  onRecuperado?: () => void;
}

const so4 = (v: string) => v.replace(/\D/g, '').slice(0, 4);

/**
 * PIN esquecido (OS-166): o código vai para o e-mail guardado quando o PIN foi
 * criado, nunca para o e-mail atual da conta. Quem não tem mais esse e-mail fala
 * com o suporte, e a casa zera o PIN.
 */
export function RecuperarPinDialog({ open, onOpenChange, emailMascarado, onRecuperado }: RecuperarPinDialogProps) {
  const queryClient = useQueryClient();
  const [desafioId, setDesafioId] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(emailMascarado);
  const [codigo, setCodigo] = useState('');
  const [pinNovo, setPinNovo] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDesafioId(null);
    setDestino(emailMascarado);
    setCodigo('');
    setPinNovo('');
    setConfirmar('');
    setErro('');
  }, [open, emailMascarado]);

  const pedirCodigo = async () => {
    setEnviando(true);
    setErro('');
    const r = await recuperarPin({ acao: 'pedir' });
    setEnviando(false);
    if (!r.ok || !r.desafioId) {
      setErro(mensagemDaRecuperacao(r));
      return;
    }
    setDesafioId(r.desafioId);
    if (r.destinoMascarado) setDestino(r.destinoMascarado);
    setCodigo('');
  };

  const criarPinNovo = async () => {
    if (pinNovo.length !== 4) { setErro('O PIN deve ter 4 dígitos'); return; }
    if (pinNovo !== confirmar) { setErro('Os PINs não coincidem'); return; }
    setEnviando(true);
    setErro('');
    const r = await recuperarPin({ acao: 'confirmar', desafioId, codigo, pinNovo });
    setEnviando(false);
    if (!r.ok) {
      setErro(mensagemDaRecuperacao(r));
      // Código que não vale mais: volta para o pedido.
      if (['expirado', 'queimado', 'nao_encontrado', 'desafio_nao_confere'].includes(r.erro ?? '')) {
        setDesafioId(null);
      }
      return;
    }
    toast.success('PIN novo criado.');
    await atualizarMeuPin(queryClient);
    onRecuperado?.();
    onOpenChange(false);
  };

  const semEmail = !emailMascarado;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!enviando) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="p-3 rounded-full bg-primary/10">
              <KeyRound className="w-7 h-7 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">Criar um PIN novo</DialogTitle>
          <DialogDescription className="text-center">
            {semEmail
              ? `Este PIN não tem e-mail guardado. Escreva para ${EMAIL_SUPORTE} e a FestPag libera um PIN novo.`
              : desafioId
                ? `Digite o código que chegou em ${destino} e escolha o PIN novo.`
                : `Vamos mandar um código para ${destino}, o e-mail guardado quando o PIN foi criado.`}
          </DialogDescription>
        </DialogHeader>

        {!semEmail && !desafioId && (
          <Button className="w-full mt-2" onClick={pedirCodigo} disabled={enviando}>
            {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Enviar código
          </Button>
        )}

        {!semEmail && desafioId && (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="pin-codigo">Código do e-mail</Label>
              <Input
                id="pin-codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={codigo}
                onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6)); setErro(''); }}
                placeholder="000000"
                className="text-center text-xl tracking-widest"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pin-novo-rec">PIN novo</Label>
                <Input
                  id="pin-novo-rec"
                  type="password"
                  inputMode="numeric"
                  value={pinNovo}
                  onChange={(e) => { setPinNovo(so4(e.target.value)); setErro(''); }}
                  placeholder="••••"
                  className="text-center text-xl tracking-widest"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin-conf-rec">Confirmar PIN novo</Label>
                <Input
                  id="pin-conf-rec"
                  type="password"
                  inputMode="numeric"
                  value={confirmar}
                  onChange={(e) => { setConfirmar(so4(e.target.value)); setErro(''); }}
                  placeholder="••••"
                  className="text-center text-xl tracking-widest"
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={criarPinNovo}
              disabled={enviando || codigo.length !== 6 || pinNovo.length !== 4 || confirmar.length !== 4}
            >
              {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Criar PIN novo
            </Button>
            <button
              type="button"
              className="w-full text-sm text-primary hover:underline"
              onClick={pedirCodigo}
              disabled={enviando}
            >
              Mandar outro código
            </button>
          </div>
        )}

        {erro && <p className="text-sm text-destructive text-center">{erro}</p>}

        {!semEmail && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Não tem mais acesso a esse e-mail? Escreva para{' '}
            <a href={`mailto:${EMAIL_SUPORTE}`} className="text-primary hover:underline">{EMAIL_SUPORTE}</a>.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
