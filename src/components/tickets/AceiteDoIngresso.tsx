import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FluxoConta } from '@/components/auth/FluxoConta';

/*
 * Receber um ingresso transferido.
 *
 * Quem abre este link normalmente nunca usou a FestPag: chegou por um WhatsApp
 * de um amigo. Dois passos, e só:
 *
 *  1. CPF   — é a TRAVA do convite. Se não for a pessoa certa, não faz sentido
 *             ela preencher mais nada.
 *  2. Conta — o mesmo FluxoConta de todo o site (virada de 09/09/2026, "uma coisa
 *             só"): quem já tem conta entra com senha + código; quem não tem cria
 *             a conta com CPF, WhatsApp e/ou e-mail, senha e código. Assim que a
 *             sessão existe, o aceite é feito sozinho.
 *
 * A conferência de verdade do CPF é no servidor, dentro do aceite; a daqui é só
 * para a pessoa não seguir à toa quando o convite não é dela.
 */

type Etapa = 'cpf' | 'conta';

interface Props {
  /** Últimos 3 dígitos do CPF que o remetente apontou. */
  cpfFinal: string;
  jaTemConta: boolean;
  emailMascarado: string | null;
  /** Executa o aceite. Recebe os dados já validados. */
  onAceitar: (dados: { cpf: string; nome?: string; telefone?: string }) => Promise<void>;
  processando: boolean;
}

const formatCpf = (v: string) =>
  v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

export function AceiteDoIngresso({ cpfFinal, jaTemConta, emailMascarado, onAceitar, processando }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('cpf');
  const [cpf, setCpf] = useState('');
  // O FluxoConta avisa "autenticado" pelo estado do usuário; uma sessão que já
  // existia dispara na hora. Este ref garante UM aceite por abertura.
  const aceitando = useRef(false);

  const cpfLimpo = cpf.replace(/\D/g, '');

  const confirmarCpf = () => {
    if (cpfLimpo.length !== 11) {
      toast.error('Digite os 11 números do seu CPF.');
      return;
    }
    if (cpfLimpo.slice(-3) !== cpfFinal) {
      toast.error(`Este convite é para o CPF final ${cpfFinal}. Confira com quem enviou.`);
      return;
    }
    aceitando.current = false;
    setEtapa('conta');
  };

  const aceitarAgora = async () => {
    if (aceitando.current) return;
    aceitando.current = true;
    try {
      await onAceitar({ cpf: cpfLimpo });
    } finally {
      aceitando.current = false;
    }
  };

  const etapas: Etapa[] = ['cpf', 'conta'];
  const indice = etapas.indexOf(etapa);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5">
        {etapas.map((e, i) => (
          <div key={e} className={cn('h-1 flex-1 rounded-full transition-colors duration-300', i <= indice ? 'bg-primary' : 'bg-border')} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={etapa}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18 }}
          className="space-y-4"
        >
          {etapa === 'cpf' && (
            <>
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-display font-semibold text-base leading-snug">Confirme seu CPF</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    Este convite foi reservado para o CPF terminado em {cpfFinal}. Só ele consegue aceitar.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-cpf">Seu CPF</Label>
                <Input id="w-cpf" inputMode="numeric" autoFocus placeholder="000.000.000-00"
                  value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))}
                  onKeyDown={(e) => e.key === 'Enter' && confirmarCpf()} />
              </div>
              <Button variant="hero" size="lg" className="w-full h-13" onClick={confirmarCpf} disabled={processando}>
                {processando ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Recebendo…</> : 'Continuar'}
              </Button>
            </>
          )}

          {etapa === 'conta' && (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {jaTemConta
                  ? `Já existe uma conta neste CPF${emailMascarado ? ` (${emailMascarado})` : ''}. Entre nela para receber o ingresso.`
                  : 'Crie a sua conta — pode ser só com o WhatsApp — e o ingresso entra nela na hora.'}
              </p>
              <div className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden">
                <FluxoConta embutido onFechar={() => setEtapa('cpf')} onAuthenticated={aceitarAgora} />
              </div>
              {processando && (
                <p className="text-sm text-muted-foreground text-center inline-flex items-center justify-center gap-2 w-full">
                  <Loader2 className="w-4 h-4 animate-spin" /> Colocando o ingresso na sua conta…
                </p>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {etapa === 'conta' && !processando && (
        <button type="button" onClick={() => setEtapa('cpf')}
          className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5">
          <ArrowLeft className="w-3 h-3" /> Voltar
        </button>
      )}
    </div>
  );
}

export default AceiteDoIngresso;
