// Lote em grupo ("Ingresso em Grupo" do painel do produtor, OS-317, 26/10/2026).
//
// ESPELHO de supabase/functions/_shared/loteEmGrupo.ts. Mudou lá, mude aqui.
//
// O preço do lote é o do GRUPO (2 ingressos por R$ 70). Na vitrine a pessoa
// escolhe grupos ("2 duplas"); o servidor desmonta cada grupo em N ingressos,
// cada um com seu QR e com face = preço ÷ N. `total_quantity` conta INGRESSOS.
// Só o site vende: maquininha, totem, portaria e venda manual escondem o lote.

interface LoteComGrupo {
  group_ticket_enabled?: boolean | null;
  group_ticket_quantity?: number | null;
}

/** Quantos ingressos sai de cada unidade do lote: N no lote em grupo, 1 no resto. */
export function tamanhoDoGrupo(lot: LoteComGrupo | null | undefined): number {
  if (!lot) return 1;
  const n = Number(lot.group_ticket_quantity);
  return lot.group_ticket_enabled === true && Number.isInteger(n) && n >= 2 ? n : 1;
}

export function ehLoteEmGrupo(lot: LoteComGrupo | null | undefined): boolean {
  return tamanhoDoGrupo(lot) > 1;
}

/** "Dupla", "Trio", "Grupo de 5". */
export function nomeDoGrupo(n: number): string {
  if (n === 2) return 'Dupla';
  if (n === 3) return 'Trio';
  return `Grupo de ${n}`;
}

/** Quantos grupos inteiros ainda cabem no que sobra do lote. */
export function gruposDisponiveis(ingressosDisponiveis: number, n: number): number {
  return Math.max(0, Math.floor(ingressosDisponiveis / Math.max(1, n)));
}

/** Preço de cada ingresso do grupo, para mostrar no ingresso e na lista do produtor. */
export function precoPorIngresso(lot: LoteComGrupo & { price: number | string }): number {
  return Number(lot.price) / tamanhoDoGrupo(lot);
}

/**
 * O que está errado num lote em grupo antes de salvar; `null` quando está certo.
 * O servidor recusa a venda nos dois casos: preço que não divide em centavos
 * exatos (um centavo apareceria ou sumiria no repasse) e quantidade que não é
 * múltipla do grupo (sobraria ingresso avulso que ninguém compra, e o lote
 * seguinte nunca abriria).
 */
export function problemaDoGrupo(lot: LoteComGrupo & { price: number | string; total_quantity: number | string }): string | null {
  const n = tamanhoDoGrupo(lot);
  if (n === 1) return null;
  const centavos = Math.round(Number(lot.price) * 100);
  if (centavos % n !== 0) return `O preço do grupo precisa dividir certinho entre os ${n} ingressos (em centavos).`;
  if (Number(lot.total_quantity) % n !== 0) return `A quantidade de ingressos precisa ser múltipla de ${n} (cada grupo leva ${n}).`;
  return null;
}
