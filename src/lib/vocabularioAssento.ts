/*
 * Como o painel chama o item do mapa neste evento.
 *
 * A maioria dos eventos vende "mesa". O rodeio vende **camarote** — produto de
 * ticket alto, em que o produtor não quer ver a palavra errada em lugar nenhum.
 * Amanhã pode aparecer "lounge", "box", "cabana".
 *
 * Por que não é só trocar a palavra: em português a troca arrasta o gênero
 * junto. "A mesa foi fechada" vira "O camarote foi fechado" — artigo, adjetivo
 * e pronome mudam. Trocar só o substantivo produziria "a camarote fechada", que
 * é justamente o tipo de detalhe que estraga a sensação de produto caro.
 *
 * ⚠️ Ligado por DADO (`events.seat_noun`), nunca por `if evento == rodeio`.
 * Evento sem o campo preenchido continua dizendo "mesa", igual a hoje — é o
 * caso dos 18 clientes atuais.
 */

export interface VocabularioAssento {
  /** "mesa" · "camarote" */
  singular: string;
  /** "mesas" · "camarotes" */
  plural: string;
  /** "a" · "o" */
  artigo: string;
  /** "A" · "O" */
  artigoMaiusculo: string;
  /** "essa" · "esse" */
  demonstrativo: string;
  /** Terminação de concordância: "a" · "o" — para "fechad{a|o}". */
  genero: 'a' | 'o';
  /** "Mesa" · "Camarote" — para começo de frase e títulos. */
  Singular: string;
  /** "Mesas" · "Camarotes" */
  Plural: string;
}

const MASCULINOS = new Set(['camarote', 'lounge', 'box', 'espaco', 'espaço', 'setor', 'quiosque']);

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Plural simples, suficiente para os nomes que aparecem aqui. */
function pluralizar(s: string): string {
  if (s.endsWith('m')) return s.slice(0, -1) + 'ns';
  if (s.endsWith('r') || s.endsWith('z') || s.endsWith('s')) return s + 'es';
  if (s.endsWith('l')) return s.slice(0, -1) + 'is';
  return s + 's';
}

/**
 * @param nome valor de `events.seat_noun`. Nulo/vazio → "mesa" (padrão de hoje).
 */
export function vocabularioAssento(nome?: string | null): VocabularioAssento {
  const base = String(nome ?? '').trim().toLowerCase() || 'mesa';
  const masculino = MASCULINOS.has(base);
  const plural = pluralizar(base);

  return {
    singular: base,
    plural,
    artigo: masculino ? 'o' : 'a',
    artigoMaiusculo: masculino ? 'O' : 'A',
    demonstrativo: masculino ? 'esse' : 'essa',
    genero: masculino ? 'o' : 'a',
    Singular: capitalizar(base),
    Plural: capitalizar(plural),
  };
}
