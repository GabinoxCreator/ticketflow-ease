/*
 * FluxoConta — A conta de cliente da FestPag: CPF, senha + código no WhatsApp ou e-mail.
 * Plano de 09/09/2026 (_docs/plano-login-cpf-whatsapp.md). Desde a virada (09/09 à
 * noite, ordem do Gabriel: "quero uma coisa só") é O caminho — na página /login
 * (embutido no cartão), no modal da compra (AuthModalV2) e no aceite de transferência.
 *
 * Feito para gente que não lida bem com e-mail: UMA pergunta por tela, letra
 * grande, botão grande, sem jargão.
 *
 *   Já tem conta:  CPF → senha → (onde receber o código) → código → entrou
 *   Conta nova:    CPF → "é você, Maria?" + nome → WhatsApp e/ou e-mail → senha
 *                  → (onde receber o código) → código → conta criada e logada
 *
 * O código é o último passo do cadastro de propósito: a conta só nasce depois de
 * a pessoa provar o canal. Desistiu no meio? Nada fica para trás.
 */
import { useState, useEffect, useCallback } from 'react';
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
import {
  identificar, pedirCodigoCadastro, confirmarCadastro, pedirCodigoLogin, confirmarLogin,
  pedirCodigoReset, confirmarReset,
  entrarComSessao, mensagemDoErro, ErroAuthV2,
  type Canal, type ContaResumo, type DadosCadastro, type RespostaEnvio,
} from '@/lib/authV2';
import {
  Eye, EyeOff, Mail, Lock, User, CreditCard, Phone, MessageCircle,
  Loader2, ArrowLeft, ArrowRight, Check,
} from 'lucide-react';

export interface FluxoContaProps {
  /** false = fechado (o estado é zerado); true = em uso. Na página é sempre true. */
  ativo?: boolean;
  /** "Voltar" na primeira tela. No modal fecha; na página volta para a home. */
  onFechar: () => void;
  onAuthenticated: () => void;
  /** true = dentro de um cartão da página (sem altura de tela cheia). */
  embutido?: boolean;
}

type Etapa = 'identificar' | 'senha' | 'escolher' | 'nome' | 'contato' | 'senha-nova' | 'canal' | 'codigo';
type Modo = 'login' | 'cadastro';

const formatPhone = (value: string) => {
  const n = value.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
};

const CAMPO = 'pl-12 h-14 text-lg bg-background/50';
const ICONE = 'absolute left-3.5 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground group-focus-within:text-primary transition-colors';

export function FluxoConta({ ativo = true, onFechar, onAuthenticated, embutido = false }: FluxoContaProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [etapa, setEtapa] = useState<Etapa>('identificar');
  const [modo, setModo] = useState<Modo>('login');
  const [ocupado, setOcupado] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // o que a pessoa digitou na primeira tela
  const [identificador, setIdentificador] = useState('');

  // login
  const [contas, setContas] = useState<ContaResumo[]>([]);
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [contaIndice, setContaIndice] = useState(0);

  // cadastro
  const [cpf, setCpf] = useState('');
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');

  // código
  const [canal, setCanal] = useState<Canal>('whatsapp');
  const [desafio, setDesafio] = useState<RespostaEnvio | null>(null);
  const [codigo, setCodigo] = useState('');
  // "Esqueci minha senha": o mesmo caminho do código, sem a senha; no fim, cria uma nova.
  const [resetando, setResetando] = useState(false);

  useEffect(() => {
    if (user && ativo) onAuthenticated();
  }, [user, ativo, onAuthenticated]);

  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);

  useEffect(() => {
    if (!ativo) {
      setEtapa('identificar'); setModo('login'); setOcupado(false); setCooldown(0);
      setIdentificador(''); setContas([]); setSenha(''); setMostrarSenha(false); setContaIndice(0);
      setCpf(''); setNome(''); setWhatsapp(''); setEmail(''); setConfirmaSenha('');
      setCanal('whatsapp'); setDesafio(null); setCodigo(''); setResetando(false);
    }
  }, [ativo]);

  const dadosCadastro = (): DadosCadastro => ({
    cpf,
    nome: nome.trim(),
    whatsapp: whatsapp.replace(/\D/g, '') || null,
    email: email.trim().toLowerCase() || null,
  });

  const falhou = (e: unknown) => {
    toast.error(mensagemDoErro(e));
  };

  // ── 1. Quem é você? ───────────────────────────────────────────────────────
  const handleIdentificar = async () => {
    const valor = identificador.trim();
    if (!valor) return;
    setOcupado(true);
    try {
      const r = await identificar(valor);
      if (r.existe === true) {
        setModo('login');
        setContas(r.contas);
        setContaIndice(0);
        setEtapa('senha');
        return;
      }
      if (r.existe === false && r.tipo === 'cpf') {
        setModo('cadastro');
        setCpf(valor.replace(/\D/g, ''));
        setEtapa('nome');
        return;
      }
      toast.error('Não achei conta com esse dado. Para criar a sua, digite o seu CPF.');
    } catch (e) {
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const opcoesDeLogin = contas.flatMap((c) => c.canais.map((k) => ({ conta: c, canal: k.canal, mascarado: k.mascarado })));

  const pedirLogin = async (indice: number, canalEscolhido: Canal) => {
    if (senha.length < 6) { toast.error('Digite a sua senha.'); setEtapa('senha'); return; }
    setOcupado(true);
    try {
      const r = await pedirCodigoLogin(identificador.trim(), indice, canalEscolhido, senha);
      setContaIndice(indice); setCanal(canalEscolhido); setDesafio(r); setCodigo('');
      setCooldown(60);
      setEtapa('codigo');
    } catch (e) {
      if (e instanceof ErroAuthV2 && e.erro === 'senha_incorreta') { setEtapa('senha'); }
      if (e instanceof ErroAuthV2 && e.erro.startsWith('whatsapp') && e.extra?.podeTentarEmail) {
        setContaIndice(indice); setCanal('email');
        toast.error(mensagemDoErro(e));
        setEtapa('escolher');
        return;
      }
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  const pedirReset = async (indice: number, canalEscolhido: Canal) => {
    setOcupado(true);
    try {
      const r = await pedirCodigoReset(identificador.trim(), indice, canalEscolhido);
      setResetando(true); setContaIndice(indice); setCanal(canalEscolhido); setDesafio(r); setCodigo('');
      setCooldown(60);
      setEtapa('codigo');
    } catch (e) {
      if (e instanceof ErroAuthV2 && (e.erro.startsWith('whatsapp') || e.erro === 'numero_sem_whatsapp') && e.extra?.podeTentarEmail) {
        toast.error(mensagemDoErro(e));
        setEtapa('escolher');
        return;
      }
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  const iniciarReset = () => {
    if (opcoesDeLogin.length === 0) { toast.error('Essa conta não tem WhatsApp nem e-mail para receber o código.'); return; }
    setResetando(true);
    if (opcoesDeLogin.length === 1) void pedirReset(opcoesDeLogin[0].conta.indice, opcoesDeLogin[0].canal);
    else setEtapa('escolher');
  };

  const concluirReset = async () => {
    if (senha.length < 6) { toast.error('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (senha !== confirmaSenha) { toast.error('As duas senhas não são iguais.'); return; }
    if (!desafio) { setEtapa('senha'); return; }
    setOcupado(true);
    try {
      const r = await confirmarReset(identificador.trim(), contaIndice, desafio.desafioId, codigo, senha);
      toast.success('Senha nova salva!');
      if (r.sessao) await entrarComSessao(r.sessao);
      else { setResetando(false); setEtapa('senha'); }
    } catch (e) {
      if (e instanceof ErroAuthV2 && e.erro === 'codigo_invalido') { toast.error(mensagemDoErro(e)); setCodigo(''); setEtapa('codigo'); return; }
      if (e instanceof ErroAuthV2 && ['expirado', 'queimado', 'nao_encontrado', 'desafio_nao_confere'].includes(e.erro)) {
        toast.error(mensagemDoErro(e));
        setCodigo(''); setDesafio(null); setCooldown(0); setResetando(false);
        setEtapa('senha');
        return;
      }
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  const handleSenha = async () => {
    if (senha.length < 6) { toast.error('Digite a sua senha.'); return; }
    if (opcoesDeLogin.length === 0) { toast.error('Essa conta não tem WhatsApp nem e-mail para receber o código.'); return; }
    if (opcoesDeLogin.length === 1) {
      await pedirLogin(opcoesDeLogin[0].conta.indice, opcoesDeLogin[0].canal);
    } else {
      setEtapa('escolher');
    }
  };

  // ── Cadastro ──────────────────────────────────────────────────────────────
  const handleNome = () => {
    const erro = validarNomePessoa(nome);
    if (erro) { toast.error(erro); return; }
    setEtapa('contato');
  };

  const handleContato = () => {
    const tel = whatsapp.replace(/\D/g, '');
    const mail = email.trim();
    if (!tel && !mail) { toast.error('Informe o seu WhatsApp ou o seu e-mail.'); return; }
    if (tel && (tel.length < 10 || tel.length > 11)) { toast.error('Celular com DDD, por favor. Exemplo: (17) 99999-9999'); return; }
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { toast.error('Esse e-mail não parece certo.'); return; }
    setEtapa('senha-nova');
  };

  const pedirCadastro = async (canalEscolhido: Canal) => {
    setOcupado(true);
    try {
      const r = await pedirCodigoCadastro(dadosCadastro(), canalEscolhido);
      setCanal(canalEscolhido); setDesafio(r); setCodigo('');
      setCooldown(60);
      setEtapa('codigo');
    } catch (e) {
      if (e instanceof ErroAuthV2 && (e.erro === 'cpf_ja_cadastrado' || e.erro === 'email_ja_cadastrado')) {
        toast.error(mensagemDoErro(e));
        setEtapa('identificar');
        return;
      }
      if (e instanceof ErroAuthV2 && (e.erro.startsWith('whatsapp') || e.erro === 'numero_sem_whatsapp') && email.trim()) {
        toast.error(mensagemDoErro(e));
        setEtapa('canal');
        return;
      }
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  const handleSenhaNova = async () => {
    if (resetando) { await concluirReset(); return; }
    if (senha.length < 6) { toast.error('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (senha !== confirmaSenha) { toast.error('As duas senhas não são iguais.'); return; }
    const temTel = !!whatsapp.replace(/\D/g, '');
    const temMail = !!email.trim();
    if (temTel && temMail) { setEtapa('canal'); return; }
    await pedirCadastro(temTel ? 'whatsapp' : 'email');
  };

  // ── Código ────────────────────────────────────────────────────────────────
  const reenviar = useCallback(async () => {
    if (cooldown > 0 || ocupado) return;
    if (modo === 'login') await (resetando ? pedirReset(contaIndice, canal) : pedirLogin(contaIndice, canal));
    else await pedirCadastro(canal);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldown, ocupado, modo, resetando, contaIndice, canal, senha, identificador, cpf, nome, whatsapp, email]);

  const handleCodigo = async () => {
    if (codigo.length !== 6 || !desafio) return;
    // Recuperação de senha: o código é conferido junto com a senha nova, no passo seguinte.
    if (resetando) { setSenha(''); setConfirmaSenha(''); setEtapa('senha-nova'); return; }
    setOcupado(true);
    try {
      const r = modo === 'login'
        ? await confirmarLogin(identificador.trim(), contaIndice, desafio.desafioId, codigo, senha)
        : await confirmarCadastro(dadosCadastro(), canal, desafio.desafioId, codigo, senha);
      await entrarComSessao(r.sessao);
      toast.success(modo === 'login'
        ? `Bem-vindo de volta${r.primeiroNome ? `, ${r.primeiroNome}` : ''}!`
        : 'Conta criada! Você já está dentro.');
      // o onAuthenticated dispara pelo AuthContext quando o usuário aparecer
    } catch (e) {
      if (e instanceof ErroAuthV2 && (e.erro === 'expirado' || e.erro === 'queimado' || e.erro === 'nao_encontrado' || e.erro === 'desafio_nao_confere')) {
        toast.error(mensagemDoErro(e));
        setCodigo(''); setDesafio(null); setCooldown(0);
        setEtapa(modo === 'login' ? 'senha' : 'senha-nova');
        return;
      }
      falhou(e);
      setCodigo('');
    } finally {
      setOcupado(false);
    }
  };

  // ── Navegação ─────────────────────────────────────────────────────────────
  const voltar = () => {
    switch (etapa) {
      case 'senha': setEtapa('identificar'); break;
      case 'escolher': setResetando(false); setEtapa('senha'); break;
      case 'nome': setEtapa('identificar'); break;
      case 'contato': setEtapa('nome'); break;
      case 'senha-nova': setEtapa(resetando ? 'codigo' : 'contato'); break;
      case 'canal': setEtapa('senha-nova'); break;
      case 'codigo':
        if (modo === 'login') { setResetando(false); setEtapa('senha'); } else setEtapa('senha-nova');
        setDesafio(null); setCodigo('');
        break;
      default: onFechar();
    }
  };

  const titulos: Record<Etapa, [string, string]> = {
    identificar: ['Entrar ou criar conta', 'Digite o seu CPF para começar'],
    senha: ['Digite a sua senha', contas[0]?.primeiroNome ? `Olá, ${contas[0].primeiroNome}!` : 'Já achei a sua conta'],
    escolher: ['Onde você quer receber o código?', 'Vamos mandar um código de 6 números'],
    nome: ['Vamos criar a sua conta', 'Digite o seu nome completo'],
    contato: ['Como falamos com você?', 'Pode ser só o WhatsApp'],
    'senha-nova': resetando ? ['Crie uma senha nova', 'Você vai usar ela para entrar'] : ['Crie uma senha', 'Você vai usar ela para entrar'],
    canal: ['Onde você quer receber o código?', 'Vamos mandar um código de 6 números'],
    codigo: ['Digite o código', desafio ? `Mandamos para ${desafio.destinoMascarado}` : ''],
  };
  const [titulo, subtitulo] = titulos[etapa];

  const passo = modo === 'cadastro'
    ? { atual: ['identificar', 'nome', 'contato', 'senha-nova', 'canal', 'codigo'].indexOf(etapa === 'canal' ? 'canal' : etapa), total: 6 }
    : null;

  const Continuar = ({ onClick, label = 'Continuar', disabled = false }: { onClick: () => void; label?: string; disabled?: boolean }) => (
    <Button type="button" onClick={onClick} disabled={ocupado || disabled} variant="hero" size="lg" className="w-full h-14 text-lg gap-2">
      {ocupado ? <><Loader2 className="h-5 w-5 animate-spin" />Um instante...</> : <>{label} <ArrowRight className="h-5 w-5" /></>}
    </Button>
  );

  const BotaoCanal = ({ c, mascarado, onClick, quem }: { c: Canal; mascarado: string; onClick: () => void; quem?: string }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      className="w-full flex items-center gap-4 rounded-2xl border-2 border-border/60 bg-background/50 px-4 py-4 text-left hover:border-primary/70 hover:bg-primary/5 transition-colors disabled:opacity-60"
    >
      {c === 'whatsapp' ? <MessageCircle className="h-7 w-7 text-emerald-500 shrink-0" /> : <Mail className="h-7 w-7 text-primary shrink-0" />}
      <span className="min-w-0">
        <span className="block text-lg font-semibold">{c === 'whatsapp' ? 'WhatsApp' : 'E-mail'}</span>
        <span className="block text-base text-muted-foreground truncate">{quem ? `${quem} · ` : ''}{mascarado}</span>
      </span>
    </button>
  );

  return (
        <div className={cn('flex flex-col', embutido ? '' : isMobile ? 'h-screen' : 'max-h-[85vh]')}>
          {/* Cabeçalho */}
          <div className={cn('border-b border-border/50', !embutido && isMobile ? 'sticky top-0 z-10 bg-card/95 backdrop-blur-xl px-4 pt-4 pb-4' : 'px-6 pt-6 pb-4')}>
            <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2">
              <button type="button" onClick={voltar} aria-label="Voltar"
                className="h-10 w-10 inline-flex items-center justify-center rounded-full text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="text-center min-w-0">
                <h2 className="font-display font-bold text-xl tracking-tight">{titulo}</h2>
                {subtitulo && <p className="text-base text-muted-foreground mt-0.5">{subtitulo}</p>}
              </div>
              <div aria-hidden className="h-10 w-10" />
            </div>
            {passo && passo.atual >= 0 && (
              <div className="flex gap-1.5 mt-4">
                {Array.from({ length: passo.total }).map((_, i) => (
                  <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all duration-500',
                    i <= passo.atual ? 'bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)]' : 'bg-muted')} />
                ))}
              </div>
            )}
          </div>

          {/* Corpo */}
          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div key={etapa} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-5">

                {etapa === 'identificar' && (
                  <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleIdentificar(); }}>
                    <div className="space-y-2">
                      <Label className="text-base">Seu CPF</Label>
                      <div className="relative group">
                        <CreditCard className={ICONE} />
                        <Input
                          autoFocus
                          inputMode="text"
                          autoComplete="username"
                          placeholder="000.000.000-00"
                          value={/^[\d.\-\s]*$/.test(identificador) && identificador.replace(/\D/g, '').length <= 11 && !identificador.includes('@') ? formatCPF(identificador) : identificador}
                          onChange={(e) => setIdentificador(e.target.value)}
                          className={CAMPO}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">Se preferir, pode digitar o seu celular com DDD ou o seu e-mail.</p>
                      {identificador.replace(/\D/g, '').length === 11 && !identificador.includes('@') && !validateCPF(identificador) && (
                        <p className="text-sm text-destructive">Esse CPF não parece certo. Se for o seu celular, tudo bem.</p>
                      )}
                    </div>
                    <Continuar onClick={handleIdentificar} disabled={!identificador.trim()} />
                  </form>
                )}

                {etapa === 'senha' && (
                  <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleSenha(); }}>
                    <div className="space-y-2">
                      <Label className="text-base">Senha</Label>
                      <div className="relative group">
                        <Lock className={ICONE} />
                        <Input autoFocus type={mostrarSenha ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha"
                          value={senha} onChange={(e) => setSenha(e.target.value)} className={cn(CAMPO, 'pr-12')} />
                        <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} aria-label="Mostrar senha"
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {mostrarSenha ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-base text-muted-foreground">Depois da senha, vamos mandar um código de 6 números para confirmar que é você.</p>
                    <Continuar onClick={handleSenha} disabled={senha.length < 6} />
                    <button type="button" onClick={iniciarReset} disabled={ocupado} className="w-full text-center text-base text-primary hover:underline font-medium py-1">
                      Esqueci minha senha
                    </button>
                  </form>
                )}

                {etapa === 'escolher' && (
                  <div className="space-y-3">
                    {opcoesDeLogin.map((o) => (
                      <BotaoCanal key={`${o.conta.indice}-${o.canal}`} c={o.canal} mascarado={o.mascarado}
                        quem={contas.length > 1 ? o.conta.primeiroNome : undefined}
                        onClick={() => (resetando ? pedirReset(o.conta.indice, o.canal) : pedirLogin(o.conta.indice, o.canal))} />
                    ))}
                    {ocupado && <p className="text-center text-base text-muted-foreground"><Loader2 className="inline h-5 w-5 animate-spin mr-2" />Mandando o código...</p>}
                  </div>
                )}

                {etapa === 'nome' && (
                  <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleNome(); }}>
                    <div className="space-y-2">
                      <Label className="text-base">Seu nome completo</Label>
                      <div className="relative group">
                        <User className={ICONE} />
                        <Input autoFocus autoComplete="name" placeholder="Como está no documento"
                          value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} />
                      </div>
                    </div>
                    <Continuar onClick={handleNome} disabled={nome.trim().length < 3} />
                  </form>
                )}

                {etapa === 'contato' && (
                  <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleContato(); }}>
                    <div className="space-y-2">
                      <Label className="text-base">Seu WhatsApp</Label>
                      <div className="relative group">
                        <Phone className={ICONE} />
                        <Input autoFocus type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(00) 00000-0000"
                          value={whatsapp} onChange={(e) => setWhatsapp(formatPhone(e.target.value))} className={CAMPO} />
                      </div>
                      <p className="text-sm text-muted-foreground">É por ele que chegam o código e os seus ingressos.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base">E-mail <span className="text-muted-foreground font-normal">(se tiver)</span></Label>
                      <div className="relative group">
                        <Mail className={ICONE} />
                        <Input type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com"
                          value={email} onChange={(e) => setEmail(e.target.value)} className={CAMPO} />
                      </div>
                    </div>
                    <Continuar onClick={handleContato} disabled={!whatsapp.replace(/\D/g, '') && !email.trim()} />
                  </form>
                )}

                {etapa === 'senha-nova' && (
                  <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleSenhaNova(); }}>
                    <div className="space-y-2">
                      <Label className="text-base">Senha</Label>
                      <div className="relative group">
                        <Lock className={ICONE} />
                        <Input autoFocus type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" placeholder="Pelo menos 6 caracteres"
                          value={senha} onChange={(e) => setSenha(e.target.value)} className={cn(CAMPO, 'pr-12')} />
                        <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} aria-label="Mostrar senha"
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {mostrarSenha ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base">Digite a senha de novo</Label>
                      <div className="relative group">
                        <Lock className={ICONE} />
                        <Input type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" placeholder="A mesma senha"
                          value={confirmaSenha} onChange={(e) => setConfirmaSenha(e.target.value)} className={CAMPO} />
                      </div>
                      {confirmaSenha && senha !== confirmaSenha && <p className="text-sm text-destructive">As duas senhas não são iguais.</p>}
                    </div>
                    <Continuar onClick={handleSenhaNova} label={resetando ? 'Salvar senha nova' : 'Continuar'} disabled={senha.length < 6 || senha !== confirmaSenha} />
                  </form>
                )}

                {etapa === 'canal' && (
                  <div className="space-y-3">
                    {whatsapp.replace(/\D/g, '') && (
                      <BotaoCanal c="whatsapp" mascarado={whatsapp} onClick={() => pedirCadastro('whatsapp')} />
                    )}
                    {email.trim() && (
                      <BotaoCanal c="email" mascarado={email.trim()} onClick={() => pedirCadastro('email')} />
                    )}
                    {ocupado && <p className="text-center text-base text-muted-foreground"><Loader2 className="inline h-5 w-5 animate-spin mr-2" />Mandando o código...</p>}
                  </div>
                )}

                {etapa === 'codigo' && (
                  <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleCodigo(); }}>
                    <p className="text-base text-muted-foreground text-center">
                      {canal === 'whatsapp' ? 'Abra o WhatsApp e copie os 6 números da mensagem da FestPag.' : 'Abra o seu e-mail e copie os 6 números da mensagem da FestPag.'}
                    </p>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={codigo} onChange={setCodigo} disabled={ocupado} autoFocus>
                        <InputOTPGroup>
                          {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-14 w-11 text-2xl" />)}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <Continuar onClick={handleCodigo} label={resetando ? 'Continuar' : modo === 'login' ? 'Entrar' : 'Criar minha conta'} disabled={codigo.length !== 6} />
                    <Button type="button" variant="ghost" onClick={reenviar} disabled={cooldown > 0 || ocupado} className="w-full h-12 text-base">
                      {cooldown > 0 ? `Não chegou? Reenviar em ${cooldown}s` : 'Não chegou? Mandar de novo'}
                    </Button>
                    {canal === 'whatsapp' && (desafio?.podeTentarEmail || (modo === 'cadastro' && !!email.trim())) && (
                      <Button type="button" variant="outline" disabled={ocupado} className="w-full h-12 text-base gap-2"
                        onClick={() => (modo === 'login' ? (resetando ? pedirReset(contaIndice, 'email') : pedirLogin(contaIndice, 'email')) : pedirCadastro('email'))}>
                        <Mail className="h-5 w-5" /> Receber pelo e-mail em vez disso
                      </Button>
                    )}
                  </form>
                )}
              </motion.div>
            </AnimatePresence>

            {etapa === 'identificar' && (
              <p className="mt-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                <Check className="h-4 w-4 text-primary" /> Seus dados ficam só com a FestPag.
              </p>
            )}
          </div>
        </div>
  );
}
