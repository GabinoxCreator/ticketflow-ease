/*
 * Quanto tempo insistir num aviso para a casa que não saiu.
 *
 * É a mesma régua do aviso de repasse (`aviso-repasse/insistencia.ts`, nascida
 * do caso de 24/09/2026: a repesca desistiu em 2 horas e o WhatsApp voltou 17
 * minutos depois). Mora aqui, em `_shared`, para o próximo aviso não copiar de
 * novo. O `aviso-repasse` continua com o arquivo dele; ao mexer nele, apontar
 * para cá.
 *
 *   · as 2 primeiras horas: a cada rodada da repesca (10 em 10 minutos);
 *   · depois disso e até 48 horas: de hora em hora;
 *   · passou de 48 horas: desiste, e AVISA que desistiu.
 *
 * Função pura de propósito: dá para rodar os casos sem rede e sem banco.
 */

export type Decisao = 'tentar' | 'esperar' | 'desistir';

/** Depois disto, o problema não é mais "o servidor caiu": é outra coisa. */
export const JANELA_INSISTENCIA_H = 48;
/** Quantas tentativas na cadência rápida (10 min) antes de espaçar. */
export const TENTATIVAS_RAPIDAS = 12;
/** Na cadência lenta, só tenta de novo depois disto (minutos). */
export const ESPERA_LONGA_MIN = 55;

export interface EstadoDoAviso {
  tentativas: number;
  /** Quando o aviso nasceu (created_at da linha de aviso). */
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
