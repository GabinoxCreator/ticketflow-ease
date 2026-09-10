/*
 * FluxoConta — a conta de cliente da FestPag.
 *
 * Redesenho de 10/09/2026, depois de o Gabriel reprovar a versão que subiu de
 * manhã ("ficou super ruim assim, não gostei"). O que ele pediu, e é o que está
 * aqui:
 *
 *   ENTRAR      celular ou e-mail + senha → código de 6 números → dentro.
 *               Duas telas. "Acabou, ponto."
 *
 *   CRIAR CONTA 1. CPF          (o nome vem do registro, ninguém digita)
 *               2. WhatsApp ou e-mail   (um dos dois, em dois cartões)
 *               3. digita o contato e confirma com o código
 *               4. senha
 *               5. facial — OPCIONAL
 *
 * As duas moram em ABAS, lado a lado, e a aba não some no meio do caminho.
 *
 * Três decisões que vieram de erro, e que é bom não desfazer sem saber:
 *
 * · O NOME NÃO APARECE E NÃO SE DIGITA. Até esta manhã a tela perguntava o nome
 *   e ainda dizia de quem era o CPF ("É você, Maria?") — a edge pública devolvia
 *   o nome do dono de QUALQUER CPF (Doca 88, vazamento). A ideia seguinte, de
 *   conferir o nome digitado, morreu porque recusava pessoa trans que usa nome
 *   social e sobrenome de casada. Decisão do Gabriel: *"nem precisa aparecer,
 *   deixa livre, a gente só segue o que está vindo do CPF."* O campo só aparece
 *   se o registro não responder (`nome_necessario`).
 *
 * · O CÓDIGO VEM ANTES DA SENHA. A pessoa prova o canal na hora, e não descobre
 *   lá no fim que errou o código depois de já ter escolhido senha. Quem segura a
 *   prova entre um passo e outro é o banco (`auth_codigos.provado_em`), não o
 *   navegador — a conta só nasce no passo da senha. Desistiu no meio? Nada fica.
 *
 * · A BARRA É UMA SÓ (`BarraDeEtapas`). Os seis tracinhos de antes carregavam o
 *   gradiente inteiro CADA UM, então a cor recomeçava a cada etapa.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { validateCPF, formatCPF } from '@/utils/cpfValidator';
import { validarNomePessoa } from '@/lib/nomePessoa';
import BarraDeEtapas from '@/components/auth/BarraDeEtapas';
import FacialInviteModal from '@/components/auth/FacialInviteModal';
import FacialCaptureFullscreen from '@/components/auth/FacialCaptureFullscreen';
import {
  identificar, pedirCodigoCadastro, provarCadastro, confirmarCadastro,
  pedirCodigoLogin, confirmarLogin, pedirCodigoReset, confirmarReset,
  entrarComSessao, mensagemDoErro, ErroAuthV2,
  type Canal, type ContaResumo, type DadosCadastro, type RespostaEnvio,
} from '@/lib/authV2';
import {
  Eye, EyeOff, Mail, Lock, User, CreditCard, Phone, MessageCircle,
  Loader2, ArrowLeft, ArrowRight, ShieldCheck, Clock, LogIn,
} from 'lucide-react';

export type AbaConta = 'entrar' | 'cadastro';

export interface FluxoContaProps {
  /** false = fechado (o estado é zerado); true = em uso. Na página é sempre true. */
  ativo?: boolean;
  /** "Voltar" na primeira tela. No modal fecha; na página volta para a home. */
  onFechar: () => void;
  onAuthenticated: () => void;
  /** true = dentro de um cartão da página (sem altura de tela cheia). */
  embutido?: boolean;
  /**
   * Qual aba abre primeiro. A COMPRA abre em 'cadastro': quem travou no
   * "ir para pagamento" quase sempre não tem conta ainda (ordem do Gabriel).
   */
  abaInicial?: AbaConta;
}

type Etapa =
  // entrar
  | 'entrar' | 'entrar-codigo' | 'entrar-senha-nova'
  // criar conta
  | 'cpf' | 'canal' | 'contato' | 'cad-codigo' | 'cad-senha' | 'facial' | 'facial-camera';

const ETAPAS_CADASTRO: Partial<Record<Etapa, { n: number; nome: string }>> = {
  'cpf': { n: 1, nome: 'Quem é você' },
  'canal': { n: 2, nome: 'Onde falamos com você' },
  'contato': { n: 3, nome: 'Confirmação' },
  'cad-codigo': { n: 3, nome: 'Confirmação' },
  'cad-senha': { n: 4, nome: 'Sua senha' },
  'facial': { n: 5, nome: 'Entrada pelo rosto' },
};
const TOTAL_ETAPAS = 5;

const formatPhone = (value: string) => {
  const n = value.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
};

const CAMPO = 'pl-12 h-14 text-base bg-background/50';
const ICONE = 'absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors';


/*
 * ⚠️ Estes três pedaços de tela moram AQUI FORA, e isso não é organização: é
 * correção de um bug que o Gabriel achou usando o site em 10/09/2026, uma hora
 * depois de o cadastro entrar no ar. Ele criou a conta, mas travou na senha —
 * *"fica voltando uma senha preenchida, não consigo preencher, está travado"*.
 *
 * A causa era eu ter declarado estes componentes DENTRO do `FluxoConta`. Um
 * componente declarado dentro de outro vira um tipo NOVO a cada render, e o
 * React não o reconhece como o mesmo: desmonta o campo e monta outro no lugar.
 * A cada tecla. O campo perde o foco, o valor do "digite de novo" some, e o
 * gerenciador de senhas do Mac reenche tudo — o que ele viu na tela.
 *
 * Fora do componente, o tipo é estável e o campo vive. Se um dia alguém for
 * "arrumar" trazendo isto para dentro de novo, o travamento volta inteiro.
 */

const BotaoPrincipal = ({ onClick, label, ocupado, disabled = false }: {
  onClick: () => void; label: string; ocupado: boolean; disabled?: boolean;
}) => (
  <Button type="submit" onClick={onClick} disabled={ocupado || disabled} variant="hero" size="lg" className="w-full h-14 text-base gap-2">
    {ocupado ? <><Loader2 className="h-5 w-5 animate-spin" />Um instante...</> : <>{label} <ArrowRight className="h-5 w-5" /></>}
  </Button>
);

const CampoSenha = ({ valor, mudou, dica, autoComplete, mostrar, alternarMostrar, autoFocus = false }: {
  valor: string; mudou: (v: string) => void; dica: string; autoComplete: string;
  mostrar: boolean; alternarMostrar: () => void; autoFocus?: boolean;
}) => (
  <div className="relative group">
    <Lock className={ICONE} />
    <Input
      autoFocus={autoFocus}
      type={mostrar ? 'text' : 'password'}
      autoComplete={autoComplete}
      placeholder={dica}
      value={valor}
      onChange={(e) => mudou(e.target.value)}
      className={cn(CAMPO, 'pr-12')}
    />
    <button type="button" onClick={alternarMostrar} aria-label={mostrar ? 'Esconder senha' : 'Mostrar senha'}
      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
      {mostrar ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  </div>
);


/* Mesma regra do `CampoSenha`: fora do componente, senão o campo do código
 * remonta a cada dígito e o `autocomplete="one-time-code"` do celular não pega. */
const TelaDoCodigo = ({
  aoConfirmar, rotulo, ehWhats, desafio, codigo, setCodigo, ocupado, cooldown,
  reenviar, podeTrocarParaEmail, trocarParaEmail,
}: {
  aoConfirmar: () => void; rotulo: string; ehWhats: boolean;
  desafio: RespostaEnvio | null; codigo: string; setCodigo: (v: string) => void;
  ocupado: boolean; cooldown: number; reenviar: () => void;
  podeTrocarParaEmail: boolean; trocarParaEmail: () => void;
}) => (
  <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); aoConfirmar(); }}>
    <div className={cn('mx-auto flex h-14 w-14 items-center justify-center rounded-2xl',
      ehWhats ? 'bg-emerald-500/15 text-emerald-400' : 'bg-primary/15 text-primary')}>
      {ehWhats ? <MessageCircle className="h-7 w-7" /> : <Mail className="h-7 w-7" />}
    </div>
    <p className="text-center text-base text-muted-foreground">
      Mandamos 6 números para <span className="font-semibold text-foreground">{desafio?.destinoMascarado}</span>
    </p>

    <div className="flex justify-center">
      <InputOTP
        maxLength={6}
        value={codigo}
        onChange={setCodigo}
        disabled={ocupado}
        autoFocus
        // Deixa o iPhone/Android oferecerem o código da mensagem sem a pessoa
        // sair da tela para copiar.
        autoComplete="one-time-code"
        inputMode="numeric"
      >
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-14 w-11 text-2xl tabular-nums" />)}
        </InputOTPGroup>
      </InputOTP>
    </div>

    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4" /> O código vale por 10 minutos.
    </p>

    <BotaoPrincipal onClick={aoConfirmar} label={rotulo} ocupado={ocupado} disabled={codigo.length !== 6} />

    <div className="space-y-1">
      <Button type="button" variant="ghost" onClick={reenviar} disabled={cooldown > 0 || ocupado} className="w-full h-11 text-sm">
        {cooldown > 0 ? `Não chegou? Reenviar em ${cooldown}s` : 'Não chegou? Mandar de novo'}
      </Button>
      {podeTrocarParaEmail && (
        <Button type="button" variant="ghost" disabled={ocupado} className="w-full h-11 text-sm gap-2 text-primary" onClick={trocarParaEmail}>
          <Mail className="h-4 w-4" /> Receber pelo e-mail
        </Button>
      )}
    </div>
  </form>
);

export function FluxoConta({
  ativo = true, onFechar, onAuthenticated, embutido = false, abaInicial = 'entrar',
}: FluxoContaProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [aba, setAba] = useState<AbaConta>(abaInicial);
  const [etapa, setEtapa] = useState<Etapa>(abaInicial === 'cadastro' ? 'cpf' : 'entrar');
  const [ocupado, setOcupado] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // entrar
  const [identificador, setIdentificador] = useState('');
  const [senha, setSenha] = useState('');
  const [opcoes, setOpcoes] = useState<{ conta: ContaResumo; canal: Canal; mascarado: string }[]>([]);
  const [contaIndice, setContaIndice] = useState(0);
  const [resetando, setResetando] = useState(false);

  // criar conta
  const [cpf, setCpf] = useState('');
  const [canal, setCanal] = useState<Canal>('whatsapp');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  /* O nome só é pedido quando o registro não respondeu — ver o cabeçalho. */
  const [precisaNome, setPrecisaNome] = useState(false);
  const [nome, setNome] = useState('');

  // código
  const [desafio, setDesafio] = useState<RespostaEnvio | null>(null);
  const [codigo, setCodigo] = useState('');

  /*
   * Segura a saída enquanto a facial está na tela. Sem isto, a sessão criada no
   * passo da senha dispara o `onAuthenticated` e a pessoa é levada embora antes
   * de ver o convite da facial. É `ref` de propósito: o efeito abaixo precisa
   * ler o valor JÁ atualizado, e `state` chegaria um render atrasado.
   */
  const seguraSaida = useRef(false);

  useEffect(() => {
    if (user && ativo && !seguraSaida.current) onAuthenticated();
  }, [user, ativo, onAuthenticated]);

  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);

  useEffect(() => {
    if (!ativo) {
      seguraSaida.current = false;
      setAba(abaInicial); setEtapa(abaInicial === 'cadastro' ? 'cpf' : 'entrar');
      setOcupado(false); setCooldown(0); setMostrarSenha(false);
      setIdentificador(''); setSenha(''); setOpcoes([]); setContaIndice(0); setResetando(false);
      setCpf(''); setCanal('whatsapp'); setWhatsapp(''); setEmail(''); setConfirmaSenha('');
      setPrecisaNome(false); setNome('');
      setDesafio(null); setCodigo('');
    }
  }, [ativo, abaInicial]);

  const dados = (): DadosCadastro => ({
    cpf,
    ...(precisaNome && nome.trim() ? { nome: nome.trim() } : {}),
    whatsapp: canal === 'whatsapp' ? whatsapp.replace(/\D/g, '') : null,
    email: canal === 'email' ? email.trim().toLowerCase() : null,
  });

  const falhou = (e: unknown) => toast.error(mensagemDoErro(e));

  const trocarAba = (nova: AbaConta) => {
    setAba(nova);
    setEtapa(nova === 'cadastro' ? 'cpf' : 'entrar');
    setCodigo(''); setDesafio(null); setResetando(false); setCooldown(0);
  };

  // ── ENTRAR ────────────────────────────────────────────────────────────────
  /** Acha a conta e já manda o código. Uma tela só, como o Gabriel pediu. */
  const entrar = async () => {
    const valor = identificador.trim();
    if (!valor) return;
    if (senha.length < 6) { toast.error('Digite a sua senha.'); return; }
    setOcupado(true);
    try {
      const r = await identificar(valor);
      if (!r.existe) {
        toast.error('Não achei conta com esse dado. Vamos criar a sua?');
        trocarAba('cadastro');
        return;
      }
      const lista = r.contas.flatMap((c) => c.canais.map((k) => ({ conta: c, canal: k.canal, mascarado: k.mascarado })));
      if (lista.length === 0) { toast.error('Essa conta não tem WhatsApp nem e-mail para receber o código.'); return; }
      setOpcoes(lista);
      await mandarCodigoDeLogin(valor, lista[0].conta.indice, lista[0].canal);
    } catch (e) {
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  const mandarCodigoDeLogin = async (valor: string, indice: number, canalEscolhido: Canal) => {
    try {
      const r = await pedirCodigoLogin(valor, indice, canalEscolhido, senha);
      setContaIndice(indice); setCanal(canalEscolhido); setDesafio(r); setCodigo('');
      setCooldown(60); setEtapa('entrar-codigo');
    } catch (e) {
      // WhatsApp fora do ar e a conta tem e-mail: tenta pelo e-mail sem incomodar.
      if (e instanceof ErroAuthV2 && (e.erro.startsWith('whatsapp') || e.erro === 'numero_sem_whatsapp') && e.extra?.podeTentarEmail) {
        const porEmail = opcoes.find((o) => o.canal === 'email');
        if (porEmail) { toast.error(mensagemDoErro(e)); await mandarCodigoDeLogin(valor, porEmail.conta.indice, 'email'); return; }
      }
      falhou(e);
    }
  };

  const esqueciASenha = async () => {
    const valor = identificador.trim();
    if (!valor) { toast.error('Digite o seu celular ou e-mail primeiro.'); return; }
    setOcupado(true);
    try {
      const r = await identificar(valor);
      if (!r.existe) { toast.error('Não achei conta com esse dado.'); return; }
      const lista = r.contas.flatMap((c) => c.canais.map((k) => ({ conta: c, canal: k.canal, mascarado: k.mascarado })));
      if (lista.length === 0) { toast.error('Essa conta não tem WhatsApp nem e-mail para receber o código.'); return; }
      setOpcoes(lista);
      const env = await pedirCodigoReset(valor, lista[0].conta.indice, lista[0].canal);
      setResetando(true); setContaIndice(lista[0].conta.indice); setCanal(lista[0].canal);
      setDesafio(env); setCodigo(''); setCooldown(60); setEtapa('entrar-codigo');
    } catch (e) {
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  const confirmarEntrada = async () => {
    if (codigo.length !== 6 || !desafio || ocupado) return;
    // Na recuperação o código é conferido junto com a senha nova, no passo seguinte.
    if (resetando) { setSenha(''); setConfirmaSenha(''); setEtapa('entrar-senha-nova'); return; }
    setOcupado(true);
    try {
      const r = await confirmarLogin(identificador.trim(), contaIndice, desafio.desafioId, codigo, senha);
      await entrarComSessao(r.sessao);
      toast.success(`Bem-vindo de volta${r.primeiroNome ? `, ${r.primeiroNome}` : ''}!`);
    } catch (e) {
      if (e instanceof ErroAuthV2 && ['expirado', 'queimado', 'nao_encontrado', 'desafio_nao_confere'].includes(e.erro)) {
        toast.error(mensagemDoErro(e));
        setCodigo(''); setDesafio(null); setCooldown(0); setEtapa('entrar');
        return;
      }
      falhou(e); setCodigo('');
    } finally {
      setOcupado(false);
    }
  };

  const salvarSenhaNova = async () => {
    if (senha.length < 6) { toast.error('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (senha !== confirmaSenha) { toast.error('As duas senhas não são iguais.'); return; }
    if (!desafio) { setEtapa('entrar'); return; }
    setOcupado(true);
    try {
      const r = await confirmarReset(identificador.trim(), contaIndice, desafio.desafioId, codigo, senha);
      toast.success('Senha nova salva!');
      if (r.sessao) await entrarComSessao(r.sessao);
      else { setResetando(false); setEtapa('entrar'); }
    } catch (e) {
      if (e instanceof ErroAuthV2 && e.erro === 'codigo_invalido') { toast.error(mensagemDoErro(e)); setCodigo(''); setEtapa('entrar-codigo'); return; }
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  // ── CRIAR CONTA ───────────────────────────────────────────────────────────
  const seguirDoCpf = async () => {
    const limpo = cpf.replace(/\D/g, '');
    if (!validateCPF(limpo)) { toast.error('Esse CPF não parece certo. Confira os números.'); return; }
    setOcupado(true);
    try {
      const r = await identificar(limpo);
      if (r.existe) {
        toast.error('Esse CPF já tem conta. Entre com o seu celular ou e-mail.');
        setIdentificador(''); trocarAba('entrar');
        return;
      }
      setEtapa('canal');
    } catch (e) {
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  const escolherCanal = (c: Canal) => { setCanal(c); setEtapa('contato'); };

  const mandarCodigoDeCadastro = async () => {
    if (canal === 'whatsapp') {
      const tel = whatsapp.replace(/\D/g, '');
      if (tel.length < 10 || tel.length > 11) { toast.error('Celular com DDD, por favor. Exemplo: (17) 99999-9999'); return; }
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Esse e-mail não parece certo.'); return;
    }
    if (precisaNome) {
      const erro = validarNomePessoa(nome);
      if (erro) { toast.error(erro); return; }
    }
    setOcupado(true);
    try {
      const r = await pedirCodigoCadastro(dados(), canal);
      setDesafio(r); setCodigo(''); setCooldown(60); setEtapa('cad-codigo');
    } catch (e) {
      // O registro não respondeu: aí sim perguntamos o nome, aqui mesmo.
      if (e instanceof ErroAuthV2 && e.erro === 'nome_necessario') {
        setPrecisaNome(true);
        toast.error(mensagemDoErro(e));
        return;
      }
      if (e instanceof ErroAuthV2 && e.erro === 'cpf_ja_cadastrado') {
        toast.error(mensagemDoErro(e)); trocarAba('entrar'); return;
      }
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  /** Confere o código e guarda a prova. A conta ainda NÃO nasce aqui. */
  const provarOCanal = async () => {
    if (codigo.length !== 6 || !desafio || ocupado) return;
    setOcupado(true);
    try {
      await provarCadastro(dados(), canal, desafio.desafioId, codigo);
      setSenha(''); setConfirmaSenha('');
      setEtapa('cad-senha');
    } catch (e) {
      if (e instanceof ErroAuthV2 && ['expirado', 'queimado', 'nao_encontrado', 'desafio_nao_confere'].includes(e.erro)) {
        toast.error(mensagemDoErro(e));
        setCodigo(''); setDesafio(null); setCooldown(0); setEtapa('contato');
        return;
      }
      falhou(e); setCodigo('');
    } finally {
      setOcupado(false);
    }
  };

  const criarAConta = async () => {
    if (senha.length < 6) { toast.error('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (senha !== confirmaSenha) { toast.error('As duas senhas não são iguais.'); return; }
    if (!desafio) { setEtapa('contato'); return; }
    setOcupado(true);
    try {
      const r = await confirmarCadastro(dados(), canal, desafio.desafioId, senha);
      // Antes de a sessão chegar: segura a saída, senão o convite da facial nem aparece.
      seguraSaida.current = true;
      setEtapa('facial');
      await entrarComSessao(r.sessao);
      toast.success('Conta criada! Falta só uma coisa, e é opcional.');
    } catch (e) {
      seguraSaida.current = false;
      if (e instanceof ErroAuthV2 && ['expirado', 'queimado', 'nao_provado', 'nao_encontrado'].includes(e.erro)) {
        toast.error(mensagemDoErro(e));
        setCodigo(''); setDesafio(null); setCooldown(0); setEtapa('contato');
        return;
      }
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  const terminar = () => { seguraSaida.current = false; onAuthenticated(); };

  // ── Código: reenvio e teclado ─────────────────────────────────────────────
  const reenviar = useCallback(async () => {
    if (cooldown > 0 || ocupado) return;
    setOcupado(true);
    try {
      if (aba === 'cadastro') {
        const r = await pedirCodigoCadastro(dados(), canal);
        setDesafio(r);
      } else if (resetando) {
        const r = await pedirCodigoReset(identificador.trim(), contaIndice, canal);
        setDesafio(r);
      } else {
        const r = await pedirCodigoLogin(identificador.trim(), contaIndice, canal, senha);
        setDesafio(r);
      }
      setCodigo(''); setCooldown(60);
      toast.success('Mandei outro código.');
    } catch (e) {
      falhou(e);
    } finally {
      setOcupado(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldown, ocupado, aba, resetando, contaIndice, canal, senha, identificador, cpf, whatsapp, email, nome, precisaNome]);

  /*
   * Seis dígitos completos → envia sozinho. É o que a pessoa espera depois de
   * colar o código do WhatsApp; obrigar a apertar um botão a mais era atrito à
   * toa. O `ocupado` evita mandar duas vezes.
   */
  const naTelaDoCodigo = etapa === 'entrar-codigo' || etapa === 'cad-codigo';
  useEffect(() => {
    if (!naTelaDoCodigo || codigo.length !== 6 || ocupado) return;
    void (etapa === 'cad-codigo' ? provarOCanal() : confirmarEntrada());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, naTelaDoCodigo]);

  // ── Navegação ─────────────────────────────────────────────────────────────
  const voltar = () => {
    switch (etapa) {
      case 'entrar-codigo': setResetando(false); setDesafio(null); setCodigo(''); setEtapa('entrar'); break;
      case 'entrar-senha-nova': setEtapa('entrar-codigo'); break;
      case 'canal': setEtapa('cpf'); break;
      case 'contato': setEtapa('canal'); break;
      case 'cad-codigo': setDesafio(null); setCodigo(''); setEtapa('contato'); break;
      case 'cad-senha': setEtapa('cad-codigo'); break;
      default: onFechar();
    }
  };

  const passo = ETAPAS_CADASTRO[etapa];
  const ehWhats = canal === 'whatsapp';

  // Os pedaços de tela moram FORA deste componente, de propósito — ver o
  // comentário de `CampoSenha` lá em cima. Aqui ficam só os atalhos de props.

  // A facial em tela cheia sai do cartão — é a câmera ocupando o aparelho inteiro.
  if (etapa === 'facial-camera') {
    return <FacialCaptureFullscreen onDone={terminar} onSkip={() => setEtapa('facial')} />;
  }

  return (
    <div className={cn('flex flex-col', embutido ? '' : isMobile ? 'h-screen' : 'max-h-[85vh]')}>
      {/* Cabeçalho */}
      <div className={cn('border-b border-border/50', !embutido && isMobile ? 'sticky top-0 z-10 bg-card/95 backdrop-blur-xl px-4 pt-4 pb-4' : 'px-6 pt-5 pb-4')}>
        <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2">
          <button type="button" onClick={voltar} aria-label="Voltar"
            className="h-10 w-10 inline-flex items-center justify-center rounded-full text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div aria-hidden />
          <div aria-hidden className="h-10 w-10" />
        </div>

        {/* As abas ficam à vista nas primeiras telas de cada caminho. */}
        {(etapa === 'entrar' || etapa === 'cpf') && (
          <div className="mt-1 flex gap-1 rounded-2xl border border-border/60 bg-muted/40 p-1">
            {(['entrar', 'cadastro'] as AbaConta[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => trocarAba(v)}
                aria-pressed={aba === v}
                className={cn(
                  'flex-1 h-11 rounded-xl text-sm font-semibold transition-all duration-300',
                  aba === v
                    ? 'bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] text-primary-foreground shadow-lg shadow-primary/25'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'entrar' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>
        )}

        {passo && <div className="mt-4"><BarraDeEtapas atual={passo.n} total={TOTAL_ETAPAS} nome={passo.nome} /></div>}
      </div>

      {/* Corpo */}
      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          <motion.div key={etapa} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-5">

            {/* ───────────── ENTRAR ───────────── */}
            {etapa === 'entrar' && (
              <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); entrar(); }}>
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">Bem-vindo de volta</h2>
                  <p className="mt-1 text-base text-muted-foreground">Entre com o seu celular ou o seu e-mail.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Celular ou e-mail</Label>
                  <div className="relative group">
                    <Mail className={ICONE} />
                    <Input autoFocus autoComplete="username" placeholder="(17) 99999-9999 ou voce@email.com"
                      value={identificador} onChange={(e) => setIdentificador(e.target.value)} className={CAMPO} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Senha</Label>
                  <CampoSenha valor={senha} mudou={setSenha} dica="Sua senha" autoComplete="current-password" mostrar={mostrarSenha} alternarMostrar={() => setMostrarSenha(!mostrarSenha)} />
                </div>

                <button type="button" onClick={esqueciASenha} disabled={ocupado}
                  className="block text-left text-sm font-medium text-primary hover:underline">
                  Esqueci minha senha
                </button>

                <BotaoPrincipal onClick={entrar} label="Entrar" ocupado={ocupado} disabled={!identificador.trim() || senha.length < 6} />

                <p className="text-center text-sm text-muted-foreground">
                  Por segurança, vamos mandar um código de 6 números para confirmar que é você.
                </p>
              </form>
            )}

            {etapa === 'entrar-codigo' && (
              <TelaDoCodigo
                aoConfirmar={confirmarEntrada}
                rotulo={resetando ? 'Continuar' : 'Entrar na minha conta'}
                ehWhats={ehWhats} desafio={desafio} codigo={codigo} setCodigo={setCodigo}
                ocupado={ocupado} cooldown={cooldown} reenviar={reenviar}
                podeTrocarParaEmail={ehWhats && !!desafio?.podeTentarEmail}
                trocarParaEmail={() => {
                  const porEmail = opcoes.find((o) => o.canal === 'email');
                  if (porEmail) void mandarCodigoDeLogin(identificador.trim(), porEmail.conta.indice, 'email');
                }}
              />
            )}

            {etapa === 'entrar-senha-nova' && (
              <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); salvarSenhaNova(); }}>
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">Crie uma senha nova</h2>
                  <p className="mt-1 text-base text-muted-foreground">É com ela que você vai entrar da próxima vez.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Senha nova</Label>
                  <CampoSenha autoFocus valor={senha} mudou={setSenha} dica="Pelo menos 6 caracteres" autoComplete="new-password" mostrar={mostrarSenha} alternarMostrar={() => setMostrarSenha(!mostrarSenha)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Digite de novo</Label>
                  <CampoSenha valor={confirmaSenha} mudou={setConfirmaSenha} dica="A mesma senha" autoComplete="new-password" mostrar={mostrarSenha} alternarMostrar={() => setMostrarSenha(!mostrarSenha)} />
                  {confirmaSenha && senha !== confirmaSenha && <p className="text-sm text-destructive">As duas senhas não são iguais.</p>}
                </div>
                <BotaoPrincipal onClick={salvarSenhaNova} label="Salvar senha nova" ocupado={ocupado} disabled={senha.length < 6 || senha !== confirmaSenha} />
              </form>
            )}

            {/* ───────────── CRIAR CONTA ───────────── */}
            {etapa === 'cpf' && (
              <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); seguirDoCpf(); }}>
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">Vamos criar a sua conta</h2>
                  <p className="mt-1 text-base text-muted-foreground">Comece pelo seu CPF.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">CPF</Label>
                  <div className="relative group">
                    <CreditCard className={ICONE} />
                    <Input autoFocus inputMode="numeric" autoComplete="off" placeholder="000.000.000-00"
                      value={formatCPF(cpf)} onChange={(e) => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      className={cn(CAMPO, 'tabular-nums')} />
                  </div>
                  {cpf.length === 11 && !validateCPF(cpf) && (
                    <p className="text-sm text-destructive">Esse CPF não parece certo. Confira os números.</p>
                  )}
                </div>
                <BotaoPrincipal onClick={seguirDoCpf} label="Continuar" ocupado={ocupado} disabled={cpf.length !== 11} />

                {/*
                  * Na COMPRA o caminho de quem já tem conta ganha um cartão próprio,
                  * e não um link miúdo. Pedido do Gabriel: "um botão lá embaixo, se
                  * já tem conta, entre agora — diferentão, bonito". Na página /login
                  * as abas já dão conta, e repetir aqui seria bagunça.
                  */}
                {abaInicial === 'cadastro' && (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-sm font-medium text-muted-foreground">ou</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    <button
                      type="button"
                      onClick={() => trocarAba('entrar')}
                      className="flex w-full items-center gap-4 rounded-2xl border-[1.5px] border-primary/40 bg-background/50 p-4 text-left transition-all hover:border-primary hover:bg-primary/10"
                    >
                      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-[hsl(330,85%,60%)]/20 text-primary">
                        <LogIn className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">Já tenho conta na FestPag</span>
                        <span className="block text-sm text-muted-foreground">Entre com o celular ou o e-mail</span>
                      </span>
                      <ArrowRight className="h-5 w-5 flex-shrink-0 text-primary" />
                    </button>
                  </>
                )}

                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" /> Seus dados ficam só com a FestPag.
                </p>
              </form>
            )}

            {etapa === 'canal' && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">Como falamos com você?</h2>
                  <p className="mt-1 text-base text-muted-foreground">É por aqui que chegam o seu código e os seus ingressos.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => escolherCanal('whatsapp')}
                    className="flex h-36 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border/60 bg-background/50 p-4 text-center transition-all hover:border-emerald-500 hover:bg-emerald-500/5">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                      <MessageCircle className="h-6 w-6" />
                    </span>
                    <span>
                      <span className="block font-semibold">WhatsApp</span>
                      <span className="block text-sm text-muted-foreground">Chega na hora</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => escolherCanal('email')}
                    className="flex h-36 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border/60 bg-background/50 p-4 text-center transition-all hover:border-primary hover:bg-primary/5">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Mail className="h-6 w-6" />
                    </span>
                    <span>
                      <span className="block font-semibold">E-mail</span>
                      <span className="block text-sm text-muted-foreground">Se preferir</span>
                    </span>
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Depois dá para adicionar o outro em <span className="font-medium text-foreground">Minha Conta</span>.
                </p>
              </div>
            )}

            {etapa === 'contato' && (
              <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); mandarCodigoDeCadastro(); }}>
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">
                    {ehWhats ? 'Qual é o seu WhatsApp?' : 'Qual é o seu e-mail?'}
                  </h2>
                  <p className="mt-1 text-base text-muted-foreground">
                    Mandamos um código para confirmar que {ehWhats ? 'o número' : 'o e-mail'} é seu.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">{ehWhats ? 'Celular com DDD' : 'E-mail'}</Label>
                  <div className="relative group">
                    {ehWhats ? <Phone className={ICONE} /> : <Mail className={ICONE} />}
                    {ehWhats ? (
                      <Input autoFocus type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(17) 99999-9999"
                        value={whatsapp} onChange={(e) => setWhatsapp(formatPhone(e.target.value))} className={CAMPO} />
                    ) : (
                      <Input autoFocus type="email" inputMode="email" autoComplete="email" placeholder="voce@email.com"
                        value={email} onChange={(e) => setEmail(e.target.value)} className={CAMPO} />
                    )}
                  </div>
                </div>

                {/* Só aparece quando o registro não respondeu — ver o cabeçalho. */}
                {precisaNome && (
                  <div className="space-y-2">
                    <Label className="text-sm">Seu nome completo</Label>
                    <div className="relative group">
                      <User className={ICONE} />
                      <Input autoComplete="name" placeholder="Como está no seu documento"
                        value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Não consegui buscar o seu nome pelo CPF agora. É ele que vai no ingresso.
                    </p>
                  </div>
                )}

                <BotaoPrincipal onClick={mandarCodigoDeCadastro} label="Mandar o código" ocupado={ocupado}
                  disabled={ehWhats ? whatsapp.replace(/\D/g, '').length < 10 : !email.trim()} />

                <Button type="button" variant="ghost" onClick={() => setEtapa('canal')} className="w-full h-11 text-sm">
                  Prefiro receber por {ehWhats ? 'e-mail' : 'WhatsApp'}
                </Button>
              </form>
            )}

            {etapa === 'cad-codigo' && (
              <TelaDoCodigo
                aoConfirmar={provarOCanal}
                rotulo="Confirmar"
                ehWhats={ehWhats} desafio={desafio} codigo={codigo} setCodigo={setCodigo}
                ocupado={ocupado} cooldown={cooldown} reenviar={reenviar}
                /* No cadastro a pessoa escolheu UM canal. Se o código não chegou pelo
                 * WhatsApp, o caminho é voltar e escolher o e-mail — não há e-mail
                 * cadastrado ainda para onde reenviar. */
                podeTrocarParaEmail={ehWhats}
                trocarParaEmail={() => { setCanal('email'); setCodigo(''); setDesafio(null); setEtapa('contato'); }}
              />
            )}

            {etapa === 'cad-senha' && (
              <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); criarAConta(); }}>
                <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">
                    {ehWhats ? 'WhatsApp' : 'E-mail'} confirmado
                  </span>
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">Crie uma senha</h2>
                  <p className="mt-1 text-base text-muted-foreground">É com ela que você vai entrar da próxima vez.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Senha</Label>
                  <CampoSenha autoFocus valor={senha} mudou={setSenha} dica="Pelo menos 6 caracteres" autoComplete="new-password" mostrar={mostrarSenha} alternarMostrar={() => setMostrarSenha(!mostrarSenha)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Digite de novo</Label>
                  <CampoSenha valor={confirmaSenha} mudou={setConfirmaSenha} dica="A mesma senha" autoComplete="new-password" mostrar={mostrarSenha} alternarMostrar={() => setMostrarSenha(!mostrarSenha)} />
                  {confirmaSenha && senha !== confirmaSenha && <p className="text-sm text-destructive">As duas senhas não são iguais.</p>}
                </div>
                <BotaoPrincipal onClick={criarAConta} label="Criar minha conta" ocupado={ocupado} disabled={senha.length < 6 || senha !== confirmaSenha} />
              </form>
            )}

            {etapa === 'facial' && (
              <FacialInviteModal onActivate={() => setEtapa('facial-camera')} onSkip={terminar} />
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
