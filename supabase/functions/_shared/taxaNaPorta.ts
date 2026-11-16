// A conta da venda na PORTA (OS-432, 16/11/2026): maquininha e totem de ingresso,
// os dois pela edge `collaborator-reserve-order`.
//
// Regra do Gabriel (16/11/2026, "Porta segue o lote"): na porta, o lote "Sem taxa"
// (`event_lots.modo_taxa = 'absorve'`) custa só a face, em Pix, cartão e dinheiro,
// e a taxa sai do produtor, como no site desde a OS-426. O lote normal continua com
// a taxa do evento por cima, como sempre.
//
// O que o repasse espera de um pedido da porta (OS-426 `order_producer_value` e
// OS-416 `taxa_do_dinheiro_do_pedido`):
//  1. Nada de taxa por cima nas linhas de lote "Sem taxa": a taxa do pedido incide
//     só sobre as linhas de lote normal, e é 0 quando o pedido é todo "Sem taxa".
//  2. Uma linha de face por lote, com `taxa_absorvida_pct` SEMPRE preenchido nas
//     linhas "Sem taxa" (o percentual do evento para o meio desta venda; no
//     dinheiro, o de `TAXA_DO_DINHEIRO_SEGUE`, hoje o do Pix) e vazio nas normais.
//     ⚠️ Vazio numa linha "Sem taxa" faria a `order_producer_value` cair no
//     percentual do CARTÃO do evento, e o dinheiro segue o do Pix.
//  3. `modo_taxa` da linha de face = 'cliente_paga': é o campo de quem pagou o
//     custo do CARTÃO nesta venda, e na porta ninguém absorve esse custo.
//  4. Nunca as duas coisas na mesma linha (taxa por cima E percentual gravado):
//     o repasse descontaria duas vezes (24% num ingresso só, ensaio da OS-416).
//
// Funções puras, sem banco: a edge lê os lotes e a taxa, e grava.

import { computeServiceFee, type EventFee } from './eventFee.ts';
import type { FaceLine } from './captureSaleTerms.ts';

/** Uma linha do pedido como a edge já tem: preço do BANCO, nunca do aparelho. */
export interface LinhaDaPorta {
  lotId: string;
  lotName: string;
  unitPrice: number;
  quantity: number;
  /** `event_lots.modo_taxa` lido do banco. */
  modoTaxa: unknown;
}

export interface ContaDaPorta {
  /** Soma das faces das linhas de lote normal: é sobre ela que a taxa incide. */
  baseDaTaxa: number;
  /** Taxa cobrada por cima (`orders.service_fee_amount`). */
  serviceFee: number;
  /** Linhas para `order_line_face` (uma por lote), no formato do `captureSaleTerms`. */
  faceLines: FaceLine[];
}

/** Só 'absorve' exato é "Sem taxa", o mesmo critério do site (`carrinhoMarcel.ts`). */
export function loteSemTaxa(modoTaxa: unknown): boolean {
  return modoTaxa === 'absorve';
}

/**
 * `fee` é a taxa do evento para o meio desta venda (`resolveFee`), ou null quando a
 * chamada não diz o meio (chamada antiga): aí não há taxa em linha nenhuma, como
 * sempre foi, e o percentual fica vazio.
 */
export function contaDaPorta(linhas: LinhaDaPorta[], fee: EventFee | null): ContaDaPorta {
  let base = 0;
  let temLoteNormal = false;
  const porLote = new Map<string, FaceLine>();

  for (const l of linhas) {
    const semTaxa = loteSemTaxa(l.modoTaxa);
    if (!semTaxa) {
      temLoteNormal = true;
      base += l.unitPrice * l.quantity;
    }
    const ja = porLote.get(l.lotId);
    if (ja) {
      ja.quantity += l.quantity;
      continue;
    }
    porLote.set(l.lotId, {
      lotId: l.lotId,
      lotName: l.lotName,
      unitFace: l.unitPrice,
      quantity: l.quantity,
      modoTaxa: 'cliente_paga',
      // Duas casas, como a coluna (`numeric(5,2)`) guarda: a edge confere o que gravou.
      taxaAbsorvidaPct: semTaxa && fee ? Math.round(Number(fee.percent) * 100) / 100 : null,
    });
  }

  const baseDaTaxa = Math.round(base * 100) / 100;
  // Mesma fórmula e arredondamento de sempre (computeServiceFee), só que sobre as
  // linhas de lote normal. Pedido todo "Sem taxa" não paga nem a parte fixa:
  // na porta ele custa só a face (decisão de 16/11).
  const serviceFee = fee && temLoteNormal ? computeServiceFee(baseDaTaxa, fee) : 0;

  return { baseDaTaxa, serviceFee, faceLines: [...porLote.values()] };
}
