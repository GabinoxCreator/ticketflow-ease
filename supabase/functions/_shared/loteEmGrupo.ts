// Lote em grupo ("Ingresso em Grupo" do painel do produtor, OS-317, 26/10/2026).
//
// O preço do lote é o do GRUPO inteiro (2 ingressos por R$ 70) e cada unidade
// vendida vira N ingressos, cada um com seu QR. `total_quantity` conta
// INGRESSOS, não grupos.
//
// Só o site vende (decisão do Gabriel, 26/10/2026, OS-317): o carrinho do
// Marcel (PIX e cartão) desmonta o grupo em ingressos. Maquininha, totem,
// portaria e venda manual cobram `price × quantidade` sem saber do grupo, e
// venderiam 1 ingresso pelo preço do par: lá o lote some da lista e é recusado.

/** Campos de `event_lots` que a regra lê. */
export const CAMPOS_DO_GRUPO = 'group_ticket_enabled, group_ticket_quantity';

/** Quantos ingressos sai de cada unidade do lote: N no lote em grupo, 1 no resto. */
export function tamanhoDoGrupo(lot: { group_ticket_enabled?: boolean | null; group_ticket_quantity?: number | null }): number {
  const n = Number(lot.group_ticket_quantity);
  return lot.group_ticket_enabled === true && Number.isInteger(n) && n >= 2 ? n : 1;
}

export function ehLoteEmGrupo(lot: { group_ticket_enabled?: boolean | null; group_ticket_quantity?: number | null }): boolean {
  return tamanhoDoGrupo(lot) > 1;
}

/** O que o operador lê quando tenta vender o lote em grupo fora do site. */
export function mensagemSoNoSite(nome: string): string {
  return `O lote "${nome}" é vendido só pelo site`;
}
