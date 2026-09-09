/*
 * Cliente do caminho novo de conta: CPF → senha + código no WhatsApp/e-mail.
 * Fala com as edges `auth-identificar` e `auth-codigo` (plano de 09/09/2026).
 *
 * As edges são públicas; o `supabase.functions.invoke` manda a chave anônima.
 * Quando a edge responde com erro (4xx/5xx), o invoke devolve um FunctionsHttpError
 * cujo `context` é a Response — o corpo JSON com `{ erro }` está lá dentro.
 */
import { supabase } from '@/integrations/supabase/client';

export type Canal = 'whatsapp' | 'email';
export type CanalDaConta = { canal: Canal; mascarado: string };
export type ContaResumo = { indice: number; primeiroNome: string; canais: CanalDaConta[] };

export type RespostaIdentificar =
  | { ok: true; existe: true; tipo: 'cpf' | 'whatsapp' | 'email'; contas: ContaResumo[] }
  | { ok: true; existe: false; tipo: 'cpf'; consulta: 'ok' | 'nao_encontrado' | 'indisponivel'; primeiroNome: string | null }
  | { ok: true; existe: false; tipo: 'whatsapp' | 'email' };

export type RespostaEnvio = {
  ok: true;
  desafioId: string;
  expiraEm: string;
  canal: Canal;
  destinoMascarado: string;
  podeTentarEmail?: boolean;
  canais?: CanalDaConta[];
};

export type Sessao = { access_token: string; refresh_token: string };
export type RespostaSessao = { ok: true; sessao: Sessao; primeiroNome?: string };

export class ErroAuthV2 extends Error {
  constructor(
    public readonly erro: string,
    public readonly status: number,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(erro);
  }
}

async function chamar<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const corpo = await ctx.clone().json().catch(() => ({}));
      throw new ErroAuthV2(String(corpo?.erro ?? 'erro'), ctx.status, corpo ?? {});
    }
    throw new ErroAuthV2('rede', 0);
  }
  if (data && data.ok === false) throw new ErroAuthV2(String(data.erro ?? 'erro'), 400, data);
  return data as T;
}

export function identificar(identificador: string) {
  return chamar<RespostaIdentificar>('auth-identificar', { identificador });
}

export type DadosCadastro = { cpf: string; nome: string; whatsapp?: string | null; email?: string | null };

export function pedirCodigoCadastro(dados: DadosCadastro, canal: Canal) {
  return chamar<RespostaEnvio>('auth-codigo', { acao: 'pedir_cadastro', ...dados, canal });
}

export function confirmarCadastro(dados: DadosCadastro, canal: Canal, desafioId: string, codigo: string, senha: string) {
  return chamar<RespostaSessao>('auth-codigo', { acao: 'confirmar_cadastro', ...dados, canal, desafioId, codigo, senha });
}

export function pedirCodigoLogin(identificador: string, contaIndice: number, canal: Canal, senha: string) {
  return chamar<RespostaEnvio>('auth-codigo', { acao: 'pedir_login', identificador, contaIndice, canal, senha });
}

export function confirmarLogin(identificador: string, contaIndice: number, desafioId: string, codigo: string, senha: string) {
  return chamar<RespostaSessao>('auth-codigo', { acao: 'confirmar_login', identificador, contaIndice, desafioId, codigo, senha });
}

// ── Esqueci a senha (Bloco 2) ──────────────────────────────────────────────
export function pedirCodigoReset(identificador: string, contaIndice: number, canal: Canal) {
  return chamar<RespostaEnvio>('auth-codigo', { acao: 'pedir_reset', identificador, contaIndice, canal });
}

export function confirmarReset(identificador: string, contaIndice: number, desafioId: string, codigo: string, novaSenha: string) {
  return chamar<{ ok: true; sessao: Sessao | null; primeiroNome?: string }>('auth-codigo', {
    acao: 'confirmar_reset', identificador, contaIndice, desafioId, codigo, novaSenha,
  });
}

// ── Minha conta: canais e senha, com código (Bloco 2) — exige sessão ───────
export function canalPedir(canal: Canal, destino?: string) {
  return chamar<RespostaEnvio>('auth-canal', { acao: 'pedir', canal, ...(destino ? { destino } : {}) });
}

export function canalConfirmar(desafioId: string, codigo: string, novaSenha?: string) {
  return chamar<{ ok: true; canal: Canal; senhaTrocada: boolean }>('auth-canal', {
    acao: 'confirmar', desafioId, codigo, ...(novaSenha ? { novaSenha } : {}),
  });
}

export type CanalPreferido = 'whatsapp' | 'email' | 'ambos';
export function canalPreferencia(canal_preferido: CanalPreferido) {
  return chamar<{ ok: true; canal_preferido: CanalPreferido }>('auth-canal', { acao: 'preferencia', canal_preferido });
}

/** E-mail interno de quem só tem WhatsApp: para a tela, é como se não existisse. */
export function ehEmailInterno(email?: string | null): boolean {
  return /@sem-email\.festpag\.digital$/i.test(String(email ?? ''));
}

/** Entrega a sessão ao Supabase do navegador — o AuthContext acorda pelo onAuthStateChange. */
export async function entrarComSessao(sessao: Sessao) {
  const { error } = await supabase.auth.setSession(sessao);
  if (error) throw new ErroAuthV2('sessao_invalida', 500);
}

/** Texto simples para cada erro que a edge devolve. */
export function mensagemDoErro(e: unknown): string {
  const erro = e instanceof ErroAuthV2 ? e.erro : 'erro';
  const tabela: Record<string, string> = {
    identificador_invalido: 'Não reconheci esse dado. Digite seu CPF, seu celular com DDD ou seu e-mail.',
    cpf_invalido: 'Esse CPF não é válido. Confira os números.',
    nome_invalido: 'Digite seu nome completo, como está no documento.',
    whatsapp_invalido: 'Esse número de celular não parece certo. Use o DDD e o número.',
    email_invalido: 'Esse e-mail não parece certo.',
    sem_contato: 'Informe pelo menos um WhatsApp ou um e-mail.',
    cpf_ja_cadastrado: 'Esse CPF já tem conta. Entre com a senha.',
    email_ja_cadastrado: 'Esse e-mail já tem conta. Entre com a senha.',
    numero_sem_whatsapp: 'Esse número não tem WhatsApp. Confira ou use o e-mail.',
    whatsapp_indisponivel: 'O WhatsApp está fora do ar agora. Tente pelo e-mail ou daqui a pouco.',
    whatsapp_recusou: 'Não consegui mandar pelo WhatsApp. Tente pelo e-mail ou daqui a pouco.',
    whatsapp_nao_configurado: 'O envio por WhatsApp ainda não está ligado. Use o e-mail.',
    email_nao_enviado: 'Não consegui mandar o e-mail. Tente de novo.',
    resend_nao_configurado: 'O envio de e-mail não está ligado.',
    codigo_invalido: 'Código errado. Confira e tente de novo.',
    expirado: 'Esse código venceu. Peça um novo.',
    queimado: 'Esse código não vale mais. Peça um novo.',
    nao_encontrado: 'Não achei esse código. Peça um novo.',
    desafio_nao_confere: 'Os dados mudaram no meio do caminho. Peça um novo código.',
    senha_invalida: 'A senha precisa ter pelo menos 6 caracteres.',
    senha_incorreta: 'Senha incorreta.',
    conta_nao_encontrada: 'Não achei essa conta.',
    escolha_conta: 'Esse CPF tem mais de uma conta. Escolha uma.',
    sem_whatsapp: 'Essa conta não tem WhatsApp cadastrado.',
    sem_email: 'Essa conta não tem e-mail cadastrado.',
    rate_limited: 'Muitas tentativas. Espere alguns minutos e tente de novo.',
    rate_limit_unavailable: 'O sistema está ocupado. Tente daqui a pouco.',
    nao_criou_conta: 'Não consegui criar a conta. Tente de novo.',
    conta_criada_sem_sessao: 'A conta foi criada. Entre com a senha que você acabou de criar.',
    nao_trocou_senha: 'Não consegui trocar a senha. Tente de novo.',
    nao_trocou_email: 'Não consegui trocar o e-mail. Tente de novo.',
    perfil_nao_encontrado: 'Não achei o seu perfil. Saia e entre de novo.',
    unauthorized: 'Sua sessão venceu. Entre de novo.',
    sessao_invalida: 'Não consegui entrar. Tente de novo.',
    rede: 'Sem conexão. Confira a internet e tente de novo.',
    internal: 'Deu um erro do nosso lado. Tente de novo.',
  };
  return tabela[erro] ?? 'Não deu certo. Tente de novo.';
}
