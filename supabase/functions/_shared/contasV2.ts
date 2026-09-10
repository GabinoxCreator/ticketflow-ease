/*
 * Achar contas a partir do que a pessoa digitou (CPF, celular ou e-mail) e
 * descrever os canais delas para a tela — sempre MASCARADOS.
 *
 * Compartilhado por `auth-identificar` (antes da senha) e `auth-codigo` (depois).
 * A ordem das contas vem do banco (`buscar_contas_por_identificador`, por data
 * de criação) e é a mesma nas duas chamadas — é por índice que a pessoa escolhe
 * quando um CPF tem mais de uma conta.
 */
import { validateCPF } from './cpf.ts';
import { normalizarNumeroBr, mascararNumeroParaTela } from './whatsapp.ts';
import { ehEmailInterno } from './codigoAcesso.ts';
import { maskEmail } from './pii.ts';

export type TipoIdentificador = 'cpf' | 'whatsapp' | 'email';
export type Candidato = { tipo: TipoIdentificador; valor: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "123.456.789-09" → cpf · "(17) 99999-9999" → whatsapp · "ana@x.com" → email.
 * Um número de 11 dígitos pode ser CPF (dígito verificador fecha) OU celular com
 * DDD — nesse caso devolve os dois candidatos, CPF primeiro; quem chama tenta
 * na ordem. Vazio = não dá para reconhecer.
 */
export function classificarIdentificador(raw: unknown): Candidato[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  if (s.includes('@')) {
    const email = s.toLowerCase();
    return EMAIL_RE.test(email) && !ehEmailInterno(email) ? [{ tipo: 'email', valor: email }] : [];
  }
  const digitos = s.replace(/\D/g, '');
  if (!digitos) return [];
  const out: Candidato[] = [];
  if (digitos.length === 11 && validateCPF(digitos)) out.push({ tipo: 'cpf', valor: digitos });
  const tel = normalizarNumeroBr(digitos);
  if (tel) out.push({ tipo: 'whatsapp', valor: tel });
  return out;
}

export type Conta = {
  user_id: string;
  nome: string;
  primeiroNome: string;
  /** já normalizado (55DDDN) ou null */
  whatsapp: string | null;
  /** só e-mail de verdade; o interno (<cpf>@sem-email…) vira null */
  email: string | null;
  papeis: string[];
};

export function primeiroNome(nome: unknown): string {
  const n = String(nome ?? '').trim().split(/\s+/)[0] ?? '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
}

export async function buscarContas(admin: any, tipo: TipoIdentificador, valor: string): Promise<Conta[]> {
  const { data, error } = await admin.rpc('buscar_contas_por_identificador', { _tipo: tipo, _valor: valor });
  if (error) {
    console.error('[CONTAS] buscar_contas_por_identificador', error.message);
    throw new Error('busca_indisponivel');
  }
  return (data ?? []).map((r: any) => ({
    user_id: r.user_id,
    nome: String(r.nome_completo ?? ''),
    primeiroNome: primeiroNome(r.nome_completo),
    whatsapp: r.whatsapp ?? null,
    email: r.email && !ehEmailInterno(r.email) ? String(r.email) : null,
    papeis: String(r.papeis ?? '').split(',').filter(Boolean),
  }));
}

/** Tenta cada candidato na ordem; devolve o primeiro que achar conta. */
export async function resolverContas(admin: any, candidatos: Candidato[]): Promise<{ candidato: Candidato; contas: Conta[] } | null> {
  for (const c of candidatos) {
    const contas = await buscarContas(admin, c.tipo, c.valor);
    if (contas.length > 0) return { candidato: c, contas };
  }
  return null;
}

export type CanalDaConta = { canal: 'whatsapp' | 'email'; mascarado: string };

/** O que a tela mostra para escolher: nunca o número/e-mail inteiro. */
export function canaisDaConta(c: Conta): CanalDaConta[] {
  const out: CanalDaConta[] = [];
  if (c.whatsapp) out.push({ canal: 'whatsapp', mascarado: mascararNumeroParaTela(c.whatsapp) });
  if (c.email) out.push({ canal: 'email', mascarado: maskEmail(c.email) });
  return out;
}

/** Resumo seguro de uma conta para a resposta pública. */
/*
 * O que a identificação pode contar sobre uma conta ANTES da senha: quase nada.
 *
 * Até 10/09/2026 isto devolvia `primeiroNome`. A tela usava para dizer "Olá,
 * Maria!" antes de pedir a senha — simpático, e um vazamento: CPF é número
 * curto, com dígito verificador, que se enumera. Qualquer um varria CPFs e
 * recebia o primeiro nome de cada cliente nosso. (Achado pelo maestro,
 * clisitef-libs-4a, chamando a porta em produção depois do item 88 — que fechou
 * a consulta à Receita mas não tocou aqui.)
 *
 * Fica o `indice` (a tela precisa dele para dizer de qual conta está falando) e
 * os canais MASCARADOS. Nome não sai daqui em hipótese nenhuma: o único lugar
 * onde nome pode sair é junto com a sessão, depois da senha e do código —
 * aí é a pessoa recebendo o próprio nome.
 */
export function resumoDaConta(c: Conta, indice: number) {
  return { indice, canais: canaisDaConta(c) };
}
