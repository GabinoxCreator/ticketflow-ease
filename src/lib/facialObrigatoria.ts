/*
 * A CHAVE da facial obrigatória no cadastro do comprador (OS-343).
 *
 * ⚠️ NASCE DESLIGADA, e só quem liga é o maestro.
 *
 * Por quê: em 28/10/2026 o Gabriel decidiu "esperar o advogado". O único parecer
 * sobre a facial (02/10/2026) é contra a obrigatória do jeito que foi construída
 * em 28/09 e recomenda o "caminho B" (facial padrão, com opção visível de seguir
 * sem rosto). O desenho novo fica pronto no código, atrás desta chave, e o site
 * continua exatamente como hoje.
 *
 * A TRAVA (revisão 2, 30/10/2026): o corte só vale com TODAS as condições de
 * `CONDICOES_PARA_LIGAR` verdadeiras. Gravar a data sozinha não liga nada. Cada
 * condição só vira `true` no mesmo commit que traz a prova dela (Doca 333, "condições
 * para ligar"), e o maestro confere a lista antes de publicar.
 *
 * COMO LIGAR (maestro): virar as condições para `true`, uma por uma, com a prova, e
 * trocar `null` em `FACIAL_OBRIGATORIA_DESDE` pelo instante do corte, com fuso,
 * por exemplo '2026-11-10T09:00:00-03:00', no mesmo commit que publica. Esse
 * instante é a "data de corte": só a conta criada DEPOIS dele é cobrada da
 * facial. Conta antiga nunca é travada (decisão do Gabriel, 28/09/2026).
 * A versão da Política de Privacidade passa a ser o dia do corte, sozinha.
 *
 * COMO DESLIGAR: voltar `FACIAL_OBRIGATORIA_DESDE` para `null` e publicar. Nada no
 * banco muda; quem já cadastrou o rosto continua com ele.
 *
 * Para PROVAR com a chave ligada sem tocar no site do ar: no computador de quem
 * constrói, `VITE_FACIAL_OBRIGATORIA_DESDE=<instante> bunx vite`. A variável só
 * vale em modo de desenvolvimento (`import.meta.env.DEV`) e pula a trava, para dar
 * para ver o desenho; no site publicado ela é ignorada e a trava vale inteira.
 */
export const CONDICOES_PARA_LIGAR = {
  /** O parecer novo do advogado libera a obrigatória (a resposta à pergunta de 29/10). */
  parecerDoAdvogado: false,
  /** A Política ligada refeita com a base legal que o advogado indicar e aprovada pelo
   *  Gabriel. O texto ligado de hoje (art. 11, II, "g") é rascunho e NÃO vale
   *  (decisão do Gabriel, 30/10/2026); nem a decisão escrita dele substitui isto. */
  politicaDoAdvogado: false,
  /** A foto tirada aqui não vira autorização de pagar com o rosto: hoje o
   *  `facial-enroll` grava `facial_consent_at` igual nos dois casos, e a
   *  `festcash-push-facial` usa esse carimbo para levar a foto à carteira. */
  fotoSeparadaDoPagamento: false,
  /** O QR na tela provado no ar (redeploy da `facial-link`, a rota `/facial` no domínio). */
  qrConferidoNoAr: false,
  /** O link de cortesia (OS-313) não pede o rosto duas vezes. Vira `true` também se
   *  ele não estiver no ar, com isso escrito no commit. */
  cortesiaOS313SemRostoDuplo: false,
} as const;

export const FACIAL_OBRIGATORIA_DESDE: string | null = null;

function lerCorte(): Date | null {
  const local = import.meta.env.DEV ? (import.meta.env.VITE_FACIAL_OBRIGATORIA_DESDE as string | undefined) : undefined;
  const valor = local || FACIAL_OBRIGATORIA_DESDE;
  if (!valor) return null;
  // No site publicado, a data sozinha não liga: todas as condições têm de estar de pé.
  if (!local && !Object.values(CONDICOES_PARA_LIGAR).every(Boolean)) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** O instante do corte, ou null com a chave desligada. */
export const CORTE_DA_FACIAL: Date | null = lerCorte();

/** A chave está ligada? */
export function facialObrigatoria(): boolean {
  return CORTE_DA_FACIAL !== null;
}

/** 'aaaa-mm-dd' no fuso de Brasília. É o formato da versão dos documentos legais. */
export function diaEmBrasilia(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

/** O dia do corte ('aaaa-mm-dd'), ou null com a chave desligada. */
export function diaDoCorte(): string | null {
  return CORTE_DA_FACIAL ? diaEmBrasilia(CORTE_DA_FACIAL) : null;
}

/**
 * Conta nova = criada depois do corte. É a única que é cobrada da facial.
 * Sem data de criação (não deveria acontecer), a conta é tratada como antiga:
 * na dúvida, ninguém é travado.
 */
export function contaNovaParaFacial(criadaEm?: string | null): boolean {
  if (!CORTE_DA_FACIAL || !criadaEm) return false;
  const t = new Date(criadaEm).getTime();
  return !Number.isNaN(t) && t >= CORTE_DA_FACIAL.getTime();
}

/* ── Idade ─────────────────────────────────────────────────────────────────
 * Menor de 18 anos não faz facial (decisão de 28/10/2026, seguindo o parecer de
 * 02/10: "bloquear o cadastro facial para menores de 18 anos", art. 14 da LGPD e
 * ECA Digital). A data de nascimento só é pedida com a chave ligada.
 */

/** dd/mm/aaaa → 'aaaa-mm-dd', ou null se a data não existe ou é impossível. */
export function nascimentoDigitado(texto: string): string | null {
  const m = texto.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  const hoje = diaEmBrasilia(new Date());
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (iso > hoje || ano < 1900) return null;
  return iso;
}

/** Idade completa hoje, no fuso de Brasília, a partir de 'aaaa-mm-dd'. */
export function idadeEm(nascimento: string, hoje: string = diaEmBrasilia(new Date())): number {
  const [a, m, d] = nascimento.split('-').map(Number);
  const [ha, hm, hd] = hoje.split('-').map(Number);
  let idade = ha - a;
  if (hm < m || (hm === m && hd < d)) idade -= 1;
  return idade;
}

/* ── O que fica guardado na conta ──────────────────────────────────────────
 * Nos metadados do usuário (auth), sem coluna nova e sem migration. São dados que
 * a própria pessoa declara; a cobrança da facial é uma regra de tela, então
 * guardar do lado dela basta. O registro da casa é a linha em `audit_logs`
 * (`registrar_convite_facial`).
 */
export type SaidaDaFacial = 'menor' | 'nao_consegue' | 'idade_nao_conferida';

export interface MetaDaFacial {
  facial_saida?: SaidaDaFacial;
  facial_saida_em?: string;
  nascimento?: string;
  /** 'base' = a base do CPF confirmou · 'digitada' = a base não respondeu · 'nao_confere' = a base disse que não bate */
  nascimento_conferido?: 'base' | 'digitada' | 'nao_confere';
}

/** "Não consigo" vale até a próxima compra; 12 horas cobre a compra que está em curso. */
const VALE_ATE_A_PROXIMA_COMPRA_MS = 12 * 60 * 60 * 1000;

/**
 * Esta conta precisa fazer a facial antes de pagar?
 * Só com a chave ligada, só conta nova, só sem rosto cadastrado.
 *  · menor de 18: não, até completar 18;
 *  · "não consigo" ou idade não conferida: não nas próximas 12 horas (a compra
 *    em curso segue); na próxima compra, o pedido volta, pelo mesmo caminho.
 */
export function precisaDaFacial(
  usuario: { created_at?: string | null; user_metadata?: Record<string, unknown> | null } | null,
  temFacial: boolean,
): boolean {
  if (!facialObrigatoria() || !usuario || temFacial) return false;
  if (!contaNovaParaFacial(usuario.created_at)) return false;
  const meta = (usuario.user_metadata ?? {}) as MetaDaFacial;
  if (meta.facial_saida === 'menor' && meta.nascimento && idadeEm(meta.nascimento) < 18) return false;
  if ((meta.facial_saida === 'nao_consegue' || meta.facial_saida === 'idade_nao_conferida') && meta.facial_saida_em) {
    const quando = new Date(meta.facial_saida_em).getTime();
    if (!Number.isNaN(quando) && Date.now() - quando < VALE_ATE_A_PROXIMA_COMPRA_MS) return false;
  }
  return true;
}
