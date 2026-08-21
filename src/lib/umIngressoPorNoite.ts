/*
 * "1 ingresso por pessoa em cada noite" — a regra anti-cambista, do lado da tela.
 *
 * O servidor já recusa o pedido que fura a regra (`_shared/umCpfPorDia.ts`), e é
 * ele que manda. Mas recusar no fim é a pior hora de contar: a pessoa monta o
 * carrinho, digita o CPF, escolhe o pagamento e só então descobre que nada
 * daquilo podia. Em 20/08 dava para somar 3 ingressos da quarta e 4 da quinta
 * sem nenhum aviso na tela.
 *
 * Este arquivo é a MESMA regra, na hora certa: no botão de somar. Não substitui
 * a trava do servidor — nenhuma trava de navegador substitui — mas evita que o
 * cliente chegue lá com um carrinho impossível.
 *
 * ⚠️ Ligada por DADO, nunca por `if evento == rodeio` (§0-A do framework). Ela
 * só existe quando o evento tem noites cadastradas e os lotes apontam para elas.
 * Evento sem isso passa por aqui e sai sem restrição — o comportamento dos
 * outros 18 clientes não muda em nada.
 */

export interface LoteParaRegra {
  id: string;
  name: string;
  /** Noite a que o lote pertence. Nulo em evento sem noites. */
  event_day_id?: string | null;
  /** Passe que vale todas as noites. */
  covers_all_days?: boolean | null;
}

export type MotivoBloqueio =
  | 'limite_da_noite'      // já tem 1 ingresso dessa noite
  | 'passe_cobre'          // o passe permanente já cobre essa noite
  | 'avulso_ocupa'         // já tem avulso, e o passe cobriria a mesma noite
  | 'limite_do_passe';     // já tem 1 passe

export interface Bloqueio {
  motivo: MotivoBloqueio;
  /** Texto para o cliente. Diz o que aconteceu E o que fazer. */
  mensagem: string;
}

/** A regra vale neste evento? Só quando as noites existem. */
export function regraValeNesteEvento(lotes: LoteParaRegra[]): boolean {
  return lotes.some((l) => !!l.event_day_id || l.covers_all_days === true);
}

/** Nome da noite a partir do lote, para a mensagem ficar concreta. */
function noiteDoLote(lote: LoteParaRegra, rotulos: Record<string, string>): string {
  const id = lote.event_day_id ?? '';
  return rotulos[id] ?? 'dessa noite';
}

/**
 * Pode somar mais um deste lote?
 *
 * @param lote        o que a pessoa quer somar
 * @param selecionados quantidades atuais por lote
 * @param todosOsLotes catálogo do evento
 * @param rotulosDeNoite `{ [event_day_id]: "Sábado 10/10" }`
 * @returns null se pode; o bloqueio, com a mensagem pronta, se não pode.
 */
export function podeSomarMaisUm(
  lote: LoteParaRegra,
  selecionados: Record<string, number>,
  todosOsLotes: LoteParaRegra[],
  rotulosDeNoite: Record<string, string> = {},
): Bloqueio | null {
  if (!regraValeNesteEvento(todosOsLotes)) return null;

  const qtdDoLote = selecionados[lote.id] ?? 0;
  const noCarrinho = todosOsLotes.filter((l) => (selecionados[l.id] ?? 0) > 0);
  const passeNoCarrinho = noCarrinho.find((l) => l.covers_all_days === true);

  // --- o passe permanente ---
  if (lote.covers_all_days) {
    if (qtdDoLote >= 1) {
      return {
        motivo: 'limite_do_passe',
        mensagem: 'Um passe já cobre as cinco noites — não dá para levar dois no mesmo CPF. '
          + 'Para outra pessoa, ela precisa comprar no CPF dela.',
      };
    }
    const avulsos = noCarrinho.filter((l) => !l.covers_all_days && l.event_day_id);
    if (avulsos.length > 0) {
      const noites = avulsos.map((l) => noiteDoLote(l, rotulosDeNoite)).join(', ');
      return {
        motivo: 'avulso_ocupa',
        mensagem: `Você já tem ingresso de ${noites} no carrinho, e o passe cobre todas as noites — `
          + 'as duas coisas se sobrepõem. Remova os ingressos avulsos para levar o passe.',
      };
    }
    return null;
  }

  // --- avulso de uma noite ---
  if (qtdDoLote >= 1) {
    return {
      motivo: 'limite_da_noite',
      mensagem: `É 1 ingresso por pessoa em cada noite. Você já tem o de ${noiteDoLote(lote, rotulosDeNoite)}. `
        + 'Para levar alguém, a compra precisa sair no CPF dessa pessoa.',
    };
  }

  if (passeNoCarrinho) {
    return {
      motivo: 'passe_cobre',
      mensagem: `Seu passe permanente já vale ${noiteDoLote(lote, rotulosDeNoite)} — `
        + 'não precisa comprar de novo.',
    };
  }

  // Outro lote da MESMA noite já no carrinho (1º e 2º lote da mesma data).
  if (lote.event_day_id) {
    const mesmaNoite = noCarrinho.find(
      (l) => l.id !== lote.id && l.event_day_id === lote.event_day_id,
    );
    if (mesmaNoite) {
      return {
        motivo: 'limite_da_noite',
        mensagem: `Você já tem um ingresso de ${noiteDoLote(lote, rotulosDeNoite)} no carrinho `
          + `(${mesmaNoite.name}). É 1 por pessoa em cada noite.`,
      };
    }
  }

  return null;
}
