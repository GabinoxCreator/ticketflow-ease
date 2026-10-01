/**
 * Loja do produtor: a conta do combo e o que impede um combo de ir à venda.
 *
 * O banco não tem trava de ativação para combo (só para produto), então estas
 * regras são a única barreira antes do checkout. Mudou aqui, confira a edge de
 * venda, que recusa combo cuja soma das partes não fecha com o preço.
 */
import type { EventLot } from '@/hooks/useEventLots';
import { isLotOpenForSale, isLotSoldOut } from '@/lib/lot-availability';
import { centavos, nomeDoProduto, reais, type ItemDoCombo, type ProdutoNoEventoCompleto } from './tipos';

type ItemParaConta = Pick<ItemDoCombo, 'kind' | 'lot_id' | 'event_product_id' | 'quantity' | 'unit_face_share'>;

/** Soma de fatia × quantidade, em centavos. */
export function somaDasPartes(itens: ItemParaConta[]): number {
  return itens.reduce((soma, i) => soma + centavos(i.unit_face_share) * (Number(i.quantity) || 0), 0);
}

/** Lotes que o comprador consegue levar agora: ativos, abertos e com ingresso. */
export function lotesAVenda(lots: EventLot[]): EventLot[] {
  return lots.filter((l) => isLotOpenForSale(l, lots) && !isLotSoldOut(l));
}

/** Lista, em português, do que falta para o combo poder ser ativado. Vazia = pode. */
export function problemasDoCombo(
  preco: number | null,
  itens: ItemParaConta[],
  lots: EventLot[],
  produtos: ProdutoNoEventoCompleto[],
): string[] {
  const problemas: string[] = [];

  if (preco == null || preco <= 0) problemas.push('Definir o preço do combo');
  if (itens.length === 0) problemas.push('Adicionar pelo menos um item');

  const soma = somaDasPartes(itens);
  if (itens.length > 0 && preco != null && soma !== centavos(preco)) {
    problemas.push(
      `A soma das partes (${reais(soma / 100)}) precisa ser igual ao preço do combo (${reais(preco)})`,
    );
  }

  for (const item of itens) {
    if (item.kind === 'product') {
      const ep = produtos.find((p) => p.id === item.event_product_id);
      if (!ep) problemas.push('Um produto do combo não está mais neste evento');
      else if (ep.status !== 'active') problemas.push(`Colocar à venda o produto ${nomeDoProduto(ep.product)}`);
    } else {
      const lote = lots.find((l) => l.id === item.lot_id);
      if (!lote) problemas.push('Um ingresso do combo não existe mais neste evento');
      else if (!lote.is_active) problemas.push(`O ingresso ${nomeDoLote(lote)} está desativado`);
    }
  }

  // O ingresso do combo tem de estar à venda SOZINHO: é o que mantém o combo
  // opcional (quem quer só o convite compra só o convite). A regra não é "o
  // evento precisa de mais de um lote": evento de lote único pode ter combo,
  // desde que esse lote esteja aberto. Mesma regra do gatilho no banco.
  const abertos = lotesAVenda(lots);
  for (const item of itens) {
    if (item.kind !== 'lot') continue;
    const lote = lots.find((l) => l.id === item.lot_id);
    if (lote && lote.is_active && !abertos.some((l) => l.id === lote.id)) {
      problemas.push(
        `O ingresso ${nomeDoLote(lote)} não está à venda sozinho (esgotado ou fora do período). O ingresso do combo tem de continuar disponível avulso`,
      );
    }
  }

  return Array.from(new Set(problemas));
}

/** "Pista · 1º Lote". */
export function nomeDoLote(lote: Pick<EventLot, 'name' | 'sector_name'>): string {
  return [lote.sector_name, lote.name].filter(Boolean).join(' · ');
}
