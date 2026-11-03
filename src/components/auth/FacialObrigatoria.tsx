/*
 * A etapa do rosto com a chave da facial obrigatória LIGADA (OS-343).
 *
 * Só aparece com `facialObrigatoria()` verdadeiro (`src/lib/facialObrigatoria.ts`).
 * Com a chave desligada o cadastro usa o convite de sempre (`FacialInviteModal`,
 * com "Agora não" e a caixa de autorização), e nada daqui é montado.
 *
 * O caminho, nesta ordem:
 *   0. CPF (revisão 1 da fase 2, 03/11): conta ANTIGA sem CPF no perfil ouviria a
 *      pergunta da data em toda compra e nunca faria a facial (sem CPF não há como
 *      conferir na base). Antes da data, a mesma tela pede o CPF e grava pelo caminho
 *      que já existe (`definir_meu_cpf`, o mesmo do checkout e da Minha Conta). CPF
 *      com dígito errado fica barrado no próprio campo. Qualquer falha da gravação
 *      (CPF de outra conta, muitas tentativas, perfil não achado, rede) NÃO prende a
 *      pessoa: vai para a saída "Não conseguimos conferir a sua idade" (já aprovada),
 *      a compra segue sem foto e a próxima compra pede de novo (revisão 2).
 *   1. IDADE. Menor de 18 não faz facial (decisão de 28/10/2026, seguindo o
 *      parecer de 02/10). A data é conferida com o CPF na base de documentos
 *      (edge `document-lookup`, a mesma do cadastro de produtor): bateu, segue;
 *      a base disse duas vezes que não bate, ou não respondeu, o rosto NÃO é
 *      coletado agora e a entrada é pelo QR (na dúvida, não se coleta dado
 *      sensível; a compra segue normal). Caminho D, 03/11/2026: a idade tem de
 *      ser CONFERIDA, não só declarada (ECA Digital), e quem garante é o servidor:
 *      a `document-lookup` marca a conta e o `facial-enroll` recusa a foto da
 *      entrada sem a marca. Até 03/11 a base fora valia a data digitada.
 *   2. CONVITE, sem "Agora não": tirar a foto aqui, ou, sem câmera neste
 *      aparelho, terminar pelo celular (QR na tela ou link no WhatsApp).
 *   3. QUEM NÃO CONSEGUE (decisão de 28/10/2026): segue sem a foto, com aviso, e
 *      entra no evento pelo QR do ingresso. A saída só aparece depois de uma
 *      tentativa (ou no caminho do celular, "não tenho celular com câmera"),
 *      para não virar o "pular" de antes. Na próxima compra o pedido volta.
 *
 * O que fica guardado: a data de nascimento e a saída escolhida, nos metadados
 * da conta (ver `MetaDaFacial`). Nenhuma coluna nova, nenhuma migration.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, DoorOpen, Loader2, ScanFace, ShieldCheck, Smartphone, Ticket, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import FacialCaptureFullscreen from '@/components/auth/FacialCaptureFullscreen';
import FacialPorCelular from '@/components/auth/FacialPorCelular';
import { marcarCadastroEmCurso } from '@/lib/cadastroEmCurso';
import { formatCPF, unformatCPF, validateCPF } from '@/utils/cpfValidator';
import {
  idadeEm, nascimentoDigitado, type MetaDaFacial, type SaidaDaFacial,
} from '@/lib/facialObrigatoria';

export type FimDaFacial = 'concluido' | SaidaDaFacial;

interface Props {
  /** CPF da conta (no cadastro já se sabe; na compra vem do perfil). */
  cpf?: string | null;
  onFim: (motivo: FimDaFacial) => void;
}

type Passo = 'idade' | 'convite' | 'camera' | 'celular' | 'sem';

const BENEFICIOS = [
  { icon: DoorOpen, title: 'Entrada sem fila', desc: 'Olhe para a câmera na portaria' },
  { icon: Zap, title: 'Mais rápido', desc: 'Sem procurar o QR no celular' },
  { icon: ShieldCheck, title: 'Só você entra', desc: 'O ingresso não é usado por outra pessoa' },
];

/** dd/mm/aaaa enquanto digita. */
const mascaraData = (v: string) => {
  const n = v.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
};

/* O recado do CPF com dígito errado: o mesmo do cadastro (FluxoConta). */
const CPF_NAO_PARECE_CERTO = 'Esse CPF não parece certo. Confira os números.';

const AVISO_SEM: Record<SaidaDaFacial, { titulo: string; texto: string }> = {
  menor: {
    titulo: 'Sem foto para menores de 18 anos',
    texto: 'Como você tem menos de 18 anos, não cadastramos o seu rosto. A sua entrada no evento é pelo QR Code do ingresso, que fica em Meus Ingressos.',
  },
  nao_consegue: {
    titulo: 'Tudo bem, dá para seguir sem a foto',
    texto: 'Sem o rosto cadastrado, a sua entrada no evento é pelo QR Code do ingresso, que fica em Meus Ingressos. Na próxima compra a gente pede a foto de novo, se você quiser tentar.',
  },
  idade_nao_conferida: {
    titulo: 'Não conseguimos conferir a sua idade',
    texto: 'Sem essa conferência, não cadastramos o seu rosto. A sua entrada no evento é pelo QR Code do ingresso, que fica em Meus Ingressos.',
  },
};

export default function FacialObrigatoria({ cpf, onFim }: Props) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const meta = (user?.user_metadata ?? {}) as MetaDaFacial;

  /* Data já CONFERIDA pela base e maior de 18: pula direto para o convite. A tela
   * só usa isto para o caminho (o `user_metadata` é da própria pessoa); se a marca
   * do servidor não existir, o `facial-enroll` recusa a foto (aviso "Não
   * conseguimos conferir a sua idade"), a tela da câmera fica na prévia, e a pessoa
   * sai pelo "Voltar" para o convite, onde o "Não consigo fazer a foto" aparece. */
  const jaTemIdade = !!meta.nascimento && meta.nascimento_conferido === 'base' && idadeEm(meta.nascimento) >= 18;
  const [passo, setPasso] = useState<Passo>(jaTemIdade ? 'convite' : 'idade');
  /* Quem já disse "não consigo" numa compra anterior vê a saída desde o início. */
  const [tentou, setTentou] = useState(meta.facial_saida === 'nao_consegue');
  const [saida, setSaida] = useState<SaidaDaFacial>('nao_consegue');

  const [data, setData] = useState('');
  const [erroData, setErroData] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [naoBateu, setNaoBateu] = useState(0);
  const [cpfDaConta, setCpfDaConta] = useState<string | null>(cpf ?? null);
  /* Já se sabe se a conta tem CPF? (lido do perfil, ou veio de quem chamou) */
  const [cpfLido, setCpfLido] = useState<boolean>(!!cpf);
  const [cpfNovo, setCpfNovo] = useState('');
  const [erroCpf, setErroCpf] = useState<string | null>(null);

  /* A trava "cadastro em curso" (10 min) é renovada a cada passo desta etapa. */
  useEffect(() => { marcarCadastroEmCurso(); }, [passo]);

  const lerCpfDoPerfil = async (): Promise<string | null> => {
    if (!user?.id) return null;
    const { data: p } = await supabase.from('profiles').select('cpf').eq('id', user.id).maybeSingle();
    return p?.cpf ? String(p.cpf) : null;
  };

  useEffect(() => {
    if (cpfDaConta) { setCpfLido(true); return; }
    if (!user?.id) return;
    let vivo = true;
    void lerCpfDoPerfil()
      .then((c) => { if (vivo && c) setCpfDaConta(c); })
      .catch(() => { /* sem leitura: a tela pede o CPF */ })
      .finally(() => { if (vivo) setCpfLido(true); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpfDaConta, user?.id]);

  /* Conta (antiga) sem CPF válido no perfil: a tela da idade pede o CPF antes. */
  const precisaCpf = cpfLido && !validateCPF(unformatCPF(cpfDaConta ?? ''));

  /* Grava o primeiro CPF da conta pelo caminho de sempre. Devolve o CPF que vale
   * para a conferência, ou null quando não deu para gravar (qualquer motivo). */
  const salvarCpf = async (digitos: string): Promise<string | null> => {
    try {
      const rpcSemTipo = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: { ok?: boolean; erro?: string } | null; error: { message?: string } | null }>;
      const { data: r, error } = await rpcSemTipo.call(supabase, 'definir_meu_cpf', { _cpf: digitos });
      if (error) return null;
      if (r?.ok) return digitos;
      if (r?.erro === 'cpf_ja_salvo') {
        // O perfil já tinha CPF (a leitura de antes falhou): vale o que está salvo.
        const salvo = await lerCpfDoPerfil().catch(() => null);
        if (salvo && validateCPF(unformatCPF(salvo))) return unformatCPF(salvo);
      }
      return null;
    } catch {
      return null;
    }
  };

  /* Grava nos metadados da conta. Falhar aqui não trava a pessoa. */
  const guardar = async (dados: MetaDaFacial) => {
    try { await supabase.auth.updateUser({ data: dados }); } catch { /* segue */ }
  };

  const seguirDaIdade = async () => {
    let doc = unformatCPF(cpfDaConta ?? '');
    if (precisaCpf) {
      if (!validateCPF(cpfNovo)) { setErroCpf(CPF_NAO_PARECE_CERTO); return; }
      setErroCpf(null);
    }
    const iso = nascimentoDigitado(data);
    if (!iso) { setErroData('Essa data não parece certa. Use dia, mês e ano, por exemplo 25/03/1998.'); return; }
    setErroData(null);
    setConferindo(true);
    try {
      const agora = new Date().toISOString();
      if (precisaCpf) {
        const valido = await salvarCpf(cpfNovo);
        if (!valido) {
          // Sem CPF gravado não há conferência: a mesma saída da base fora do ar.
          await guardar({ nascimento: iso, nascimento_conferido: 'digitada', facial_saida: 'idade_nao_conferida', facial_saida_em: agora });
          setSaida('idade_nao_conferida'); setPasso('sem');
          return;
        }
        doc = valido;
        setCpfDaConta(valido);
      }
      if (idadeEm(iso) < 18) {
        await guardar({ nascimento: iso, nascimento_conferido: 'digitada', facial_saida: 'menor', facial_saida_em: agora });
        setSaida('menor'); setPasso('sem');
        return;
      }
      let conferido: 'base' | 'digitada' | 'nao_confere' = 'digitada';
      if (doc.length === 11) {
        try {
          const { data: r } = await supabase.functions.invoke('document-lookup', {
            body: { type: 'cpf', document: doc, birth_date: iso },
          });
          // Só é "conferida" quando a base devolveu a data e ela BATE com a digitada
          // (`nascimento_confere`, OS-343 revisão 1). Base que achou o CPF sem dizer a
          // data vale como digitada; data que não bate conta como "não confere".
          if (r?.ok === true) {
            conferido = r?.nascimento_confere === true ? 'base' : r?.nascimento_confere === false ? 'nao_confere' : 'digitada';
          } else if (r?.reason === 'not_found') conferido = 'nao_confere';
        } catch { /* base fora: a idade não foi conferida */ }
      }
      /* Caminho D (03/11): sem a base confirmar, não se coleta o rosto agora. A
       * compra segue, a entrada é pelo QR e a próxima compra pede de novo. */
      if (conferido === 'digitada') {
        await guardar({ nascimento: iso, nascimento_conferido: 'digitada', facial_saida: 'idade_nao_conferida', facial_saida_em: agora });
        setSaida('idade_nao_conferida'); setPasso('sem');
        return;
      }
      if (conferido === 'nao_confere') {
        const vezes = naoBateu + 1;
        setNaoBateu(vezes);
        if (vezes < 2) { setErroData('Essa data não confere com o seu CPF. Confira e tente de novo.'); return; }
        await guardar({ nascimento: iso, nascimento_conferido: 'nao_confere', facial_saida: 'idade_nao_conferida', facial_saida_em: agora });
        setSaida('idade_nao_conferida'); setPasso('sem');
        return;
      }
      await guardar({ nascimento: iso, nascimento_conferido: conferido });
      setPasso('convite');
    } finally {
      setConferindo(false);
    }
  };

  const naoConsigo = () => { setSaida('nao_consegue'); setPasso('sem'); };

  const confirmarSaida = async () => {
    if (saida === 'nao_consegue') {
      await guardar({ facial_saida: 'nao_consegue', facial_saida_em: new Date().toISOString() });
    }
    onFim(saida);
  };

  if (passo === 'camera') {
    return (
      <FacialCaptureFullscreen
        obrigatoria
        onDone={() => onFim('concluido')}
        onSkip={() => { setTentou(true); setPasso('convite'); }}
      />
    );
  }

  return (
    <motion.div key={passo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {passo === 'idade' && (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void seguirDaIdade(); }}>
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-pink-500 text-primary-foreground">
              <CalendarDays className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-xl font-bold tracking-tight">Antes da foto, a sua idade</h3>
              <p className="text-sm text-muted-foreground">
                Menores de 18 anos não cadastram o rosto: entram no evento pelo QR Code do ingresso. Por isso pedimos a sua data de nascimento, que conferimos com o seu CPF.
              </p>
            </div>
          </div>
          {precisaCpf && (
            <div className="space-y-2">
              <Label className="text-sm" htmlFor="cpf-facial">CPF</Label>
              <Input id="cpf-facial" autoFocus inputMode="numeric" autoComplete="off" placeholder="000.000.000-00"
                value={formatCPF(cpfNovo)} onChange={(e) => { setCpfNovo(e.target.value.replace(/\D/g, '').slice(0, 11)); setErroCpf(null); }}
                className="h-14 text-base bg-background/50 tabular-nums" />
              {erroCpf && <p className="text-sm text-destructive">{erroCpf}</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-sm" htmlFor="nascimento-facial">Data de nascimento</Label>
            <Input id="nascimento-facial" autoFocus={!precisaCpf} inputMode="numeric" autoComplete="bday" placeholder="dd/mm/aaaa"
              value={data} onChange={(e) => { setData(mascaraData(e.target.value)); setErroData(null); }}
              className="h-14 text-base bg-background/50 tabular-nums" />
            {erroData && <p className="text-sm text-destructive">{erroData}</p>}
          </div>
          <Button type="submit" variant="hero" size="lg" className="w-full h-14 text-base gap-2" disabled={conferindo || !cpfLido || data.length !== 10 || (precisaCpf && cpfNovo.length !== 11)}>
            {conferindo ? <><Loader2 className="h-5 w-5 animate-spin" />Conferindo...</> : <>Continuar <ArrowRight className="h-5 w-5" /></>}
          </Button>
        </form>
      )}

      {passo === 'convite' && (
        <>
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-pink-500 text-primary-foreground">
              <ScanFace className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-xl font-bold tracking-tight">Falta o seu rosto</h3>
              <p className="text-sm text-muted-foreground">
                É a última etapa da sua conta. A foto do rosto confirma que é você na entrada do evento.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {BENEFICIOS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col gap-2 rounded-xl border border-border bg-card/50 p-3 text-left">
                <Icon className="h-5 w-5 text-primary" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-tight">{title}</p>
                  <p className="text-xs leading-snug text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Aviso destacado: com a facial necessária para a conta, o dever que
            * fica é o de informar com clareza (LGPD art. 9º). Texto aprovado pelo
            * Gabriel antes de subir; base legal conforme a resposta do advogado. */}
          <div className="rounded-lg border border-border bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="aviso-facial">
            Sua foto serve só para confirmar que é você na entrada dos eventos. Ela fica guardada em área privada da FestPag
            e é conferida por um fornecedor de reconhecimento facial; não aparece para outras pessoas nem para o produtor.
            Pagar com o rosto nos totens é outra coisa: é opcional e pede autorização própria. Detalhes e como pedir a
            exclusão na{' '}
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-[3px]">
              Política de Privacidade
            </a>
            .
          </div>

          <div className="space-y-3">
            <Button type="button" variant="hero" size="lg" className="w-full gap-2" onClick={() => setPasso('camera')}>
              <ScanFace className="h-4 w-4" />
              Tirar foto agora
            </Button>
            {!isMobile && (
              <Button type="button" variant="ghost" size="lg" className="w-full gap-2 text-muted-foreground" onClick={() => setPasso('celular')}>
                <Smartphone className="h-4 w-4" />
                Não tenho câmera neste aparelho
              </Button>
            )}
            {tentou && (
              <button type="button" onClick={naoConsigo}
                className="block w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Não consigo fazer a foto
              </button>
            )}
          </div>
        </>
      )}

      {passo === 'celular' && (
        <FacialPorCelular
          onPronto={() => onFim('concluido')}
          onVoltar={() => { setTentou(true); setPasso('convite'); }}
          onNaoConsigo={naoConsigo}
        />
      )}

      {passo === 'sem' && (
        <div className="space-y-5">
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Ticket className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-xl font-bold tracking-tight">{AVISO_SEM[saida].titulo}</h3>
              <p className="text-sm text-muted-foreground">{AVISO_SEM[saida].texto}</p>
            </div>
          </div>
          <Button type="button" variant="hero" size="lg" className="w-full gap-2" onClick={() => void confirmarSaida()}>
            Entendi, continuar <ArrowRight className="h-4 w-4" />
          </Button>
          {saida === 'nao_consegue' && (
            <Button type="button" variant="ghost" size="lg" className="w-full text-muted-foreground" onClick={() => setPasso('convite')}>
              Voltar e tentar de novo
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
