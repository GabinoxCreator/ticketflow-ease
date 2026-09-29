/*
 * Quanto tempo insistir num aviso que não saiu.
 *
 * NASCEU DE UM CASO REAL (24/09/2026, medido em 28/09): o aviso do repasse da
 * Luana foi recusado 12 vezes seguidas, das 08h21 às 10h21, e a repesca
 * desistiu — o limite era 12 tentativas de 10 em 10 minutos, duas horas. A
 * instância do WhatsApp voltou a funcionar às **10h38**: dezessete minutos
 * depois de eu desistir. O aviso nunca chegou, e morreu calado, que é
 * exatamente o problema que este trabalho existe para resolver.
 *
 * O erro de desenho foi meu e está escrito no próprio comentário antigo: a
 * repesca existe porque "a Evolution cai — ficou fora o dia 08/09 inteiro", e
 * mesmo assim foi configurada para desistir em duas horas.
 *
 * A régua agora tem duas velocidades, para insistir muito sem encher o log:
 *   · as 2 primeiras horas — a cada rodada da repesca (10 em 10 minutos);
 *   · depois disso e até 48 horas — de hora em hora;
 *   · passou de 48 horas — desiste, e AVISA que desistiu.
 *
 * Função pura de propósito: dá para rodar os casos sem rede e sem banco.
 */

export type Decisao = 'tentar' | 'esperar' | 'desistir';

/** Depois disto, o problema não é mais "o servidor caiu" — é outra coisa. */
export const JANELA_INSISTENCIA_H = 48;
/** Quantas tentativas na cadência rápida (10 min) antes de espaçar. */
export const TENTATIVAS_RAPIDAS = 12;
/** Na cadência lenta, só tenta de novo depois disto (minutos). */
export const ESPERA_LONGA_MIN = 55;

export interface EstadoDoAviso {
  tentativas: number;
  /** Quando o aviso nasceu (created_at da linha em payout_avisos). */
  criadoEm: string;
  /** Última vez que se tentou (updated_at). Nulo = nunca. */
  ultimaEm: string | null;
}

export function decidirTentativa(e: EstadoDoAviso, agora: Date = new Date()): Decisao {
  const nasceu = new Date(e.criadoEm).getTime();
  const idadeH = (agora.getTime() - nasceu) / 3_600_000;

  // Data impossível não pode travar o aviso: no caso de dúvida, tenta.
  if (!isFinite(idadeH)) return 'tentar';
  if (idadeH >= JANELA_INSISTENCIA_H) return 'desistir';
  if (e.tentativas < TENTATIVAS_RAPIDAS) return 'tentar';

  const ultima = e.ultimaEm ? new Date(e.ultimaEm).getTime() : NaN;
  if (!isFinite(ultima)) return 'tentar';
  const desdeUltimaMin = (agora.getTime() - ultima) / 60_000;
  return desdeUltimaMin >= ESPERA_LONGA_MIN ? 'tentar' : 'esperar';
}
