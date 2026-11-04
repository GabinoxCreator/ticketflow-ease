import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, CalendarDays, Loader2, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import FacialCaptureFullscreen from '@/components/auth/FacialCaptureFullscreen';
import FacialInviteModal from '@/components/auth/FacialInviteModal';
import { registrarConviteFacial } from '@/lib/conviteFacialLog';
import { idadeEm, nascimentoDigitado, type MetaDaFacial } from '@/lib/facialObrigatoria';

/*
 * A facial, opcional, logo depois de aceitar um ingresso (OS-372, decisão do Gabriel de
 * 04/11/2026: "Oferecer depois do aceite", para o convidado e para o Transferir de sempre).
 *
 * Quem cria a conta no aceite já vê o convite da facial no cadastro; quem já tinha conta sem
 * facial não via nada. Aqui ela vê, com "Agora não" em todo passo: a facial nunca é obrigatória
 * para entrar (parecer do advogado, 02/10), a entrada pelo QR continua.
 *
 * Idade antes da câmera: menor de 18 não faz facial (decisão de 28/10). A data é conferida com o
 * CPF na base de documentos (`document-lookup`, como na etapa da OS-343): a base disse que não
 * bate, o rosto NÃO é coletado; a base fora do ar vale a data digitada.
 *
 * Quem chama só monta isto quando a conta não tem facial e o CPF da conta é o do ingresso
 * (é pelo CPF do perfil que a portaria liga o rosto ao ingresso).
 */

type Passo = 'oferta' | 'idade' | 'convite' | 'camera' | 'sem' | 'feito';

interface Props {
  cpf: string;
  onFim: () => void;
}

const mascaraData = (v: string) => {
  const n = v.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
};

export function FacialDepoisDoAceite({ cpf, onFim }: Props) {
  const { user } = useAuth();
  const meta = (user?.user_metadata ?? {}) as MetaDaFacial;
  /* Data de adulto já informada (e não recusada pela base): pula a pergunta, como a etapa de sempre. */
  const jaTemIdade = !!meta.nascimento && meta.nascimento_conferido !== 'nao_confere' && idadeEm(meta.nascimento) >= 18;
  const [passo, setPasso] = useState<Passo>('oferta');
  const [naoBateu, setNaoBateu] = useState(0);
  const mostrou = useRef(false);
  useEffect(() => {
    if (mostrou.current) return;
    mostrou.current = true;
    registrarConviteFacial('mostrado', 'login');
  }, []);
  const [data, setData] = useState('');
  const [erroData, setErroData] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [semMotivo, setSemMotivo] = useState<'menor' | 'idade_nao_conferida'>('menor');

  const guardar = async (dados: MetaDaFacial) => {
    try { await supabase.auth.updateUser({ data: dados }); } catch { /* segue */ }
  };

  const agoraNao = () => { registrarConviteFacial('recusado', 'login'); onFim(); };

  const seguirDaIdade = async () => {
    const iso = nascimentoDigitado(data);
    if (!iso) { setErroData('Essa data não parece certa. Use dia, mês e ano, por exemplo 25/03/1998.'); return; }
    setErroData(null);
    setConferindo(true);
    try {
      if (idadeEm(iso) < 18) {
        await guardar({ nascimento: iso, nascimento_conferido: 'digitada', facial_saida: 'menor', facial_saida_em: new Date().toISOString() });
        registrarConviteFacial('recusado', 'login:menor');
        setSemMotivo('menor'); setPasso('sem');
        return;
      }
      let conferido: 'base' | 'digitada' | 'nao_confere' = 'digitada';
      try {
        const { data: r } = await supabase.functions.invoke('document-lookup', {
          body: { type: 'cpf', document: cpf.replace(/\D/g, ''), birth_date: iso },
        });
        if (r?.ok === true) {
          conferido = r?.nascimento_confere === true ? 'base' : r?.nascimento_confere === false ? 'nao_confere' : 'digitada';
        } else if (r?.reason === 'not_found') conferido = 'nao_confere';
      } catch { /* base fora: vale a data digitada */ }
      // Duas tentativas, como a etapa de sempre (`FacialObrigatoria`): um erro de digitação
      // não encerra a oferta.
      if (conferido === 'nao_confere') {
        const vezes = naoBateu + 1;
        setNaoBateu(vezes);
        if (vezes < 2) { setErroData('Essa data não confere com o seu CPF. Confira e tente de novo.'); return; }
        await guardar({ nascimento: iso, nascimento_conferido: 'nao_confere', facial_saida: 'idade_nao_conferida', facial_saida_em: new Date().toISOString() });
        registrarConviteFacial('recusado', 'login:idade_nao_conferida');
        setSemMotivo('idade_nao_conferida'); setPasso('sem');
        return;
      }
      await guardar({ nascimento: iso, nascimento_conferido: conferido });
      setPasso('convite');
    } finally {
      setConferindo(false);
    }
  };

  if (passo === 'camera') {
    return (
      <FacialCaptureFullscreen
        onDone={() => { registrarConviteFacial('concluido', 'login'); setPasso('feito'); }}
        onSkip={() => setPasso('convite')}
      />
    );
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md mx-auto space-y-5">
        {passo === 'oferta' && (
          <>
            <div className="text-center space-y-2">
              <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
              <h1 className="font-display font-bold text-2xl">Ingresso é seu!</h1>
              <p className="text-sm text-muted-foreground">Ele já está em <strong>Meus Ingressos</strong>.</p>
            </div>
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-3">
              <div className="flex gap-2.5">
                <ScanFace className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-display font-semibold">Quer entrar mais rápido?</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Cadastre a sua facial e, no dia, é só olhar para a câmera na portaria. É opcional:
                    sem ela, você entra pelo QR do ingresso.
                  </p>
                </div>
              </div>
              <Button variant="hero" className="w-full h-12" onClick={() => setPasso(jaTemIdade ? 'convite' : 'idade')}>Cadastrar a minha facial</Button>
              <Button variant="ghost" className="w-full" onClick={agoraNao}>Agora não</Button>
            </div>
          </>
        )}

        {passo === 'idade' && (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-4">
            <div className="text-center space-y-1">
              <CalendarDays className="w-9 h-9 text-primary mx-auto" />
              <h1 className="font-display font-bold text-xl">Qual a sua data de nascimento?</h1>
              <p className="text-sm text-muted-foreground">A facial é só para quem tem 18 anos ou mais.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fda-nascimento">Data de nascimento</Label>
              <Input id="fda-nascimento" inputMode="numeric" placeholder="dd/mm/aaaa"
                value={data} onChange={(e) => setData(mascaraData(e.target.value))} />
              {erroData && <p className="text-xs text-destructive">{erroData}</p>}
            </div>
            <Button variant="hero" className="w-full h-12" onClick={seguirDaIdade} disabled={conferindo}>
              {conferindo ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Conferindo…</> : 'Continuar'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={agoraNao}>Agora não</Button>
          </div>
        )}

        {passo === 'convite' && (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
            <FacialInviteModal onActivate={() => setPasso('camera')} onSkip={agoraNao} />
          </div>
        )}

        {passo === 'sem' && (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-3 text-center">
            <h1 className="font-display font-bold text-xl">
              {semMotivo === 'menor' ? 'Sem foto para menores de 18 anos' : 'Não conseguimos conferir a sua idade'}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {semMotivo === 'menor'
                ? 'Como você tem menos de 18 anos, não cadastramos o seu rosto. A sua entrada no evento é pelo QR do ingresso, que fica em Meus Ingressos.'
                : 'Sem essa conferência, não cadastramos o seu rosto. A sua entrada no evento é pelo QR do ingresso, que fica em Meus Ingressos.'}
            </p>
            <Button variant="hero" className="w-full h-12" onClick={onFim}>Ver meus ingressos</Button>
          </div>
        )}

        {passo === 'feito' && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h1 className="font-display font-bold text-xl">Facial cadastrada</h1>
            <p className="text-sm text-muted-foreground">No dia, é só olhar para a câmera na portaria. O QR do ingresso continua valendo.</p>
            <Button variant="hero" className="w-full h-12" onClick={onFim}>Ver meus ingressos</Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
