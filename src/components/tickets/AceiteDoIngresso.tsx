import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ShieldCheck, Mail, KeyRound, User, ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { validarNomePessoa, normalizarNomePessoa } from '@/lib/nomePessoa';

/*
 * Receber um ingresso transferido — uma pergunta por vez.
 *
 * Quem abre este link normalmente nunca usou a FestPag: chegou por um WhatsApp
 * de um amigo. Antes, a tela pedia CPF, nome, e-mail, senha e telefone de uma
 * vez, e quem já era cliente só descobria no fim que não podia criar conta
 * (Gabriel, 21/08). Formulário longo com gente que não conhece o produto é onde
 * se perde a pessoa.
 *
 * A ordem tem razão de ser:
 *
 *  1. CPF   — é a TRAVA do convite. Se não for a pessoa certa, não faz sentido
 *             ela preencher mais nada. Falhar aqui custa dez segundos, não cinco
 *             campos.
 *  2. E-mail— e aqui o caminho se abre: quem já tem conta neste CPF vai para
 *             "entrar"; quem não tem, para "criar".
 *  3. Código— confirmação do e-mail por código de 6 dígitos. É o que transforma
 *             um endereço digitado em DADO AUTENTICADO: sem isso, um erro de
 *             digitação vira uma pessoa sem acesso ao próprio ingresso no dia do
 *             evento, e sem como recuperar a senha.
 *  4. Senha — só no fim, quando já se sabe que a pessoa é ela mesma.
 *
 * Quem já tem conta pula 3 e 4: o e-mail dela já foi confirmado um dia.
 */

type Etapa = 'cpf' | 'email' | 'codigo' | 'senha' | 'entrar';

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

const formatTelefone = (v: string) =>
  v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');

export function AceiteDoIngresso({ cpfFinal, jaTemConta, emailMascarado, onAceitar, processando }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('cpf');
  const [cpf, setCpf] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [telefone, setTelefone] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  const cpfLimpo = cpf.replace(/\D/g, '');

  /** Passo 1 — o CPF confere com o do convite? */
  const confirmarCpf = () => {
    if (cpfLimpo.length !== 11) {
      toast.error('Digite os 11 números do seu CPF.');
      return;
    }
    // A conferência de verdade é no servidor, no aceite. Esta é só para a pessoa
    // não seguir preenchendo o resto à toa quando o convite não é dela.
    if (cpfLimpo.slice(-3) !== cpfFinal) {
      toast.error(`Este convite é para o CPF final ${cpfFinal}. Confira com quem enviou.`);
      return;
    }
    setEtapa(jaTemConta ? 'entrar' : 'email');
  };

  /** Passo 2 — manda o código para o e-mail informado. */
  const enviarCodigo = async (silencioso = false) => {
    const erroNome = validarNomePessoa(nome);
    if (erroNome) { toast.error(erroNome); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Digite um e-mail válido.');
      return;
    }
    silencioso ? setReenviando(true) : setOcupado(true);
    try {
      const { error } = await supabase.functions.invoke('send-verification-code', {
        body: { email: email.trim(), name: normalizarNomePessoa(nome), cpf: cpfLimpo },
      });
      if (error) throw error;
      toast.success(`Código enviado para ${email.trim()}.`);
      setEtapa('codigo');
    } catch {
      toast.error('Não consegui enviar o código agora. Confira o e-mail e tente de novo.');
    } finally {
      setOcupado(false); setReenviando(false);
    }
  };

  /** Passo 3 — o código do e-mail. */
  const conferirCodigo = async () => {
    if (codigo.replace(/\D/g, '').length !== 6) {
      toast.error('O código tem 6 números.');
      return;
    }
    setOcupado(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-email-code', {
        body: { email: email.trim(), code: codigo.replace(/\D/g, '') },
      });
      if (error) throw error;
      if (data && data.valid === false) {
        toast.error('Código incorreto ou vencido. Peça um novo.');
        return;
      }
      setEtapa('senha');
    } catch {
      toast.error('Não consegui conferir o código. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  /** Passo 4 — cria a conta e aceita. */
  const criarEAceitar = async () => {
    if (senha.length < 6) {
      toast.error('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setOcupado(true);
    try {
      const { error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { nome_completo: normalizarNomePessoa(nome) } },
      });
      if (signErr) {
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (loginErr) {
          toast.error('Já existe uma conta com este e-mail e a senha não confere. Use "Esqueci minha senha" e volte a este link.');
          return;
        }
      }
      await onAceitar({ cpf: cpfLimpo, nome: normalizarNomePessoa(nome), telefone: telefone.replace(/\D/g, '') || undefined });
    } finally {
      setOcupado(false);
    }
  };

  /** Caminho de quem já é cliente. */
  const entrarEAceitar = async () => {
    if (!email.trim() || !senha) {
      toast.error('Informe o e-mail e a senha da sua conta.');
      return;
    }
    setOcupado(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) {
        toast.error('E-mail ou senha não conferem. Se esqueceu a senha, recupere e volte a este link.');
        return;
      }
      await onAceitar({ cpf: cpfLimpo });
    } finally {
      setOcupado(false);
    }
  };

  const etapas: Etapa[] = jaTemConta ? ['cpf', 'entrar'] : ['cpf', 'email', 'codigo', 'senha'];
  const indice = etapas.indexOf(etapa);
  const trabalhando = ocupado || processando;

  const voltar = () => {
    const anterior = etapas[indice - 1];
    if (anterior) setEtapa(anterior);
  };

  return (
    <div className="space-y-5">
      {/* Trilho de progresso: mostra que é curto. Sem ele, uma pergunta por vez
          parece um caminho sem fim. */}
      <div className="flex items-center gap-1.5">
        {etapas.map((e, i) => (
          <div
            key={e}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i <= indice ? 'bg-primary' : 'bg-border',
            )}
          />
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
              <Cabecalho
                Icone={ShieldCheck}
                titulo="Confirme seu CPF"
                texto={`Este convite foi reservado para o CPF terminado em ${cpfFinal}. Só ele consegue aceitar.`}
              />
              <div className="space-y-2">
                <Label htmlFor="w-cpf">Seu CPF</Label>
                <Input id="w-cpf" inputMode="numeric" autoFocus placeholder="000.000.000-00"
                  value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))}
                  onKeyDown={(e) => e.key === 'Enter' && confirmarCpf()} />
              </div>
              <Button variant="hero" size="lg" className="w-full h-13" onClick={confirmarCpf}>
                Continuar
              </Button>
            </>
          )}

          {etapa === 'email' && (
            <>
              <Cabecalho
                Icone={Mail}
                titulo="Seus dados"
                texto="Vamos mandar um código para confirmar que o e-mail é seu — é por ele que você acessa o ingresso no dia."
              />
              <div className="space-y-2">
                <Label htmlFor="w-nome">Seu nome completo</Label>
                <Input id="w-nome" autoFocus placeholder="Como no documento"
                  value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-email">Seu e-mail</Label>
                <Input id="w-email" type="email" placeholder="email@exemplo.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && enviarCodigo()} />
              </div>
              <Button variant="hero" size="lg" className="w-full h-13" onClick={() => enviarCodigo()} disabled={trabalhando}>
                {trabalhando ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Enviando…</> : 'Enviar código'}
              </Button>
            </>
          )}

          {etapa === 'codigo' && (
            <>
              <Cabecalho
                Icone={KeyRound}
                titulo="Digite o código"
                texto={`Mandamos 6 números para ${email}. Ele vale por 10 minutos.`}
              />
              <div className="space-y-2">
                <Label htmlFor="w-cod">Código</Label>
                <Input id="w-cod" inputMode="numeric" autoFocus placeholder="000000" maxLength={6}
                  className="text-center text-2xl tracking-[0.4em] font-mono h-14"
                  value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && conferirCodigo()} />
              </div>
              <Button variant="hero" size="lg" className="w-full h-13" onClick={conferirCodigo} disabled={trabalhando}>
                {trabalhando ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Conferindo…</> : 'Confirmar'}
              </Button>
              <button type="button" onClick={() => enviarCodigo(true)} disabled={reenviando}
                className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5">
                {reenviando ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                Não chegou? Enviar de novo
              </button>
            </>
          )}

          {etapa === 'senha' && (
            <>
              <Cabecalho
                Icone={CheckCircle2}
                titulo="E-mail confirmado"
                texto="Falta só criar uma senha. É com ela que você abre seus ingressos no dia do evento."
              />
              <div className="space-y-2">
                <Label htmlFor="w-senha">Crie uma senha</Label>
                <Input id="w-senha" type="password" autoFocus placeholder="Mínimo 6 caracteres"
                  value={senha} onChange={(e) => setSenha(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-tel">WhatsApp <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input id="w-tel" inputMode="numeric" placeholder="(17) 99999-9999"
                  value={telefone} onChange={(e) => setTelefone(formatTelefone(e.target.value))} />
              </div>
              <Button variant="hero" size="lg" className="w-full h-14 text-base font-semibold"
                onClick={criarEAceitar} disabled={trabalhando}>
                {trabalhando ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Recebendo…</> : 'Receber meu ingresso'}
              </Button>
            </>
          )}

          {etapa === 'entrar' && (
            <>
              <Cabecalho
                Icone={User}
                titulo="Você já tem conta"
                texto={emailMascarado
                  ? `Encontramos uma conta neste CPF, com o e-mail ${emailMascarado}. Entre nela para receber o ingresso.`
                  : 'Encontramos uma conta neste CPF. Entre nela para receber o ingresso.'}
              />
              <div className="space-y-2">
                <Label htmlFor="w-email2">Seu e-mail</Label>
                <Input id="w-email2" type="email" autoFocus placeholder="email@exemplo.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-senha2">Sua senha</Label>
                <Input id="w-senha2" type="password" placeholder="A senha da sua conta"
                  value={senha} onChange={(e) => setSenha(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && entrarEAceitar()} />
                <p className="text-[11px] text-muted-foreground">
                  Esqueceu? Recupere a senha e volte a este link — ele vale 24 horas.
                </p>
              </div>
              <Button variant="hero" size="lg" className="w-full h-14 text-base font-semibold"
                onClick={entrarEAceitar} disabled={trabalhando}>
                {trabalhando ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Entrando…</> : 'Entrar e receber o ingresso'}
              </Button>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {indice > 0 && !trabalhando && (
        <button type="button" onClick={voltar}
          className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5">
          <ArrowLeft className="w-3 h-3" /> Voltar
        </button>
      )}
    </div>
  );
}

function Cabecalho({ Icone, titulo, texto }: { Icone: typeof Mail; titulo: string; texto: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
        <Icone className="w-4.5 h-4.5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="font-display font-semibold text-base leading-snug">{titulo}</p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{texto}</p>
      </div>
    </div>
  );
}

export default AceiteDoIngresso;
