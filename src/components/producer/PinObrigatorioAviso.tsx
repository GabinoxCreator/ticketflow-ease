import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { AVISO_PIN, useMeuPin } from '@/lib/pinRepasse';

/*
 * Pop-up "Crie o seu PIN de segurança" (OS-166, decisão do Gabriel em 07/10:
 * "quando não cadastrou, sempre que logar e entrar no painel do produtor, aviso
 * de pop-up levando para configurar o PIN e a conta").
 *
 * Para quem: o DONO da produtora (é a conta dele que recebe o repasse) que
 * ainda não tem PIN. A casa (admin) e a equipe não veem.
 * Quando: uma vez por entrada no painel. "Entrada" = a página carregada de novo
 * ou um login novo (muda o `last_sign_in_at`); andar entre as telas do painel
 * não repete o aviso. O "Agora não" fecha até a próxima entrada.
 */
let jaMostrado: string | null = null;

export function PinObrigatorioAviso() {
  const { user } = useAuth();
  const { data: meuPin } = useMeuPin();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);

  const entrada = user ? `${user.id}:${user.last_sign_in_at ?? ''}` : null;

  useEffect(() => {
    if (!entrada || !meuPin) return;
    const precisa = meuPin.dono_de_produtora && !meuPin.admin && (!meuPin.tem_pin || meuPin.refazer);
    if (precisa && jaMostrado !== entrada) {
      jaMostrado = entrada;
      setAberto(true);
    }
    if (!precisa) setAberto(false);
  }, [entrada, meuPin]);

  const criar = () => {
    setAberto(false);
    navigate('/produtor/financeiro?aba=dados');
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="p-3 rounded-full bg-primary/10">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">{AVISO_PIN.titulo}</DialogTitle>
          <DialogDescription className="text-center text-base leading-relaxed">
            {AVISO_PIN.texto}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button className="w-full" onClick={criar}>{AVISO_PIN.botao}</Button>
          <Button variant="ghost" className="w-full" onClick={() => setAberto(false)}>
            {AVISO_PIN.depois}
          </Button>
        </DialogFooter>
        <p className="text-xs text-muted-foreground text-center">{AVISO_PIN.rodape}</p>
      </DialogContent>
    </Dialog>
  );
}
