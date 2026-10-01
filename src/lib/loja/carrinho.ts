/**
 * O carrinho do evento quando ele leva produto e combo além de ingresso.
 *
 * O checkout sempre recebeu uma lista de `{ lotId, lotName, quantity, price }`.
 * Em vez de trocar esse formato em dezessete arquivos, produto e combo entram
 * NA MESMA lista, com `tipo` dizendo o que cada linha é. Linha sem `tipo` é
 * ingresso, como sempre foi: carrinho só de ingresso passa por aqui sem mudar
 * uma vírgula do que é enviado ao servidor.
 *
 * ⚠️ Preço aqui é só para MOSTRAR. O servidor recebe ids e quantidades e relê
 * tudo do banco (`_shared/carrinhoMarcel.ts`).
 */

export interface ItemDoCarrinho {
  /** Ingresso: id do lote. Produto e combo: chave única da linha (`p:…`, `c:…`). */
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
  modoTaxa?: string | null;
  tipo?: 'lot' | 'product' | 'bundle';
  /** Quanto de UMA unidade entra na base da taxa de conveniência. Só o combo
   *  preenche: dentro dele pode haver parte com taxa e parte sem. */
  baseDaTaxaUnit?: number;
  // produto avulso
  eventProductId?: string;
  variantId?: string | null;
  // combo
  bundleId?: string;
  /** Tamanho escolhido para cada produto do combo: { eventProductId: variantId }. */
  escolhas?: Record<string, string | null>;
}

export const ehIngresso = (i: Pick<ItemDoCarrinho, 'tipo'>) => !i.tipo || i.tipo === 'lot';

export function chaveDoProduto(eventProductId: string, variantId: string | null): string {
  return `p:${eventProductId}:${variantId ?? ''}`;
}

export function chaveDoCombo(bundleId: string, escolhas: Record<string, string | null>): string {
  const partes = Object.keys(escolhas).sort().map((k) => `${k}=${escolhas[k] ?? ''}`);
  return `c:${bundleId}:${partes.join(',')}`;
}

export const ehLinhaDaLoja = (id: string) => id.startsWith('p:') || id.startsWith('c:');

/**
 * O que vai no corpo da chamada de pagamento. `items` continua sendo só os
 * lotes, no formato de sempre; `products` e `bundles` só aparecem quando há.
 */
export function corpoDoCarrinho(itens: ItemDoCarrinho[]) {
  const items = itens.filter(ehIngresso).map((i) => ({ lotId: i.lotId, quantity: i.quantity }));
  const products = itens
    .filter((i) => i.tipo === 'product' && i.eventProductId)
    .map((i) => ({ eventProductId: i.eventProductId!, variantId: i.variantId ?? null, quantity: i.quantity }));
  const bundles = itens
    .filter((i) => i.tipo === 'bundle' && i.bundleId)
    .map((i) => ({ bundleId: i.bundleId!, quantity: i.quantity, escolhas: i.escolhas ?? {} }));
  return {
    items,
    ...(products.length > 0 ? { products } : {}),
    ...(bundles.length > 0 ? { bundles } : {}),
  };
}

export const temLoja = (itens: ItemDoCarrinho[]) => itens.some((i) => !ehIngresso(i));

/** Só os ingressos comprados avulsos entram na base do cupom (regra do servidor). */
export function baseDoCupom(itens: ItemDoCarrinho[]): number {
  return itens.filter(ehIngresso).reduce((s, i) => s + i.price * i.quantity, 0);
}

/** Quantos INGRESSOS há no carrinho (combo conta os que traz dentro é com o
 *  servidor; aqui é só o rótulo "N ingressos" da tela). */
export function contarIngressos(itens: ItemDoCarrinho[]): number {
  return itens.filter(ehIngresso).reduce((s, i) => s + i.quantity, 0);
}
