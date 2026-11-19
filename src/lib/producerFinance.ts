/**
 * producerFinance — fonte ÚNICA da verdade do resumo financeiro do produtor.
 *
 * Funções puras, testáveis, aditivas (espelha a ideia do computeClosing do totem).
 * Toda tela do produtor (Visão Geral, aba Financeiro, header de Pedidos e a
 * página de repasse) deriva os números daqui — nunca recalcula por conta própria.
 *
 * Definições canônicas — iguais em TODAS as telas:
 *  - Só pedidos PAGOS entram (status 'paid' | 'completed').
 *  - CORTESIA (sale_origin='courtesy') NUNCA entra em receita.
 *  - "Valor do ingresso" de um pedido = o que o ingresso vale PARA O PRODUTOR:
 *    a face vendida, sem a taxa de conveniência e sem juro de parcela e, nos
 *    lotes "Sem taxa" (OS-426), já sem a taxa de serviço que o produtor paga.
 *    Quem calcula é o BANCO (função `order_producer_value`, servida ao painel
 *    pela RPC `producer_order_values` — ver src/lib/orderProducerValues.ts):
 *      · com face gravada no ato da venda (`order_line_face`): face − cupom
 *        (− a taxa absorvida, nos lotes "Sem taxa");
 *      · sem face gravada (venda antiga, Mercado Pago, manual, maquininha):
 *        total − taxa, que nessas rotas é a própria face.
 *    ⚠️ POR QUE NÃO É MAIS `total_amount − service_fee_amount` (08/09/2026): na
 *    rota do Marcel o cartão parcelado grava o JURO dentro de `total_amount`,
 *    e a conta antiga dava o juro inteiro ao produtor. Na Oktoberfest o repasse
 *    apareceu como R$ 23.129,53 num evento que só vende ingresso de R$ 200.
 *    `orderTicketNet` ainda aceita pedido sem `producer_value` (conta antiga)
 *    para os poucos lugares que não passam pela RPC.
 *  - Três baldes de origem, todos com a mesma regra de valor:
 *      · online = sale_origin 'online' (ou null tratado como online) — venda pela internet;
 *      · fisica = sale_origin 'smartpos' — venda no totem físico / SmartPOS;
 *      · manual = sale_origin 'manual' — registro manual do produtor.
 *  - Total = online + fisica + manual (é tudo que o evento vendeu).
 *  - REPASSE SÓ SOBRE O QUE PASSOU PELO NOSSO CAIXA (decisões do Gabriel de
 *    18/08 e 02/09/2026). Duas coisas o produtor já recebeu direto, na mão:
 *      · a VENDA MANUAL inteira (PIX dele, maquininha dele, dinheiro);
 *      · o DINHEIRO em espécie de qualquer origem (totem/SmartPOS grava
 *        payment_method='cash').
 *    Elas continuam CONTADAS nas vendas (o produtor precisa enxergar o que
 *    vendeu), mas saem do que a FestPag tem a pagar:
 *        repasse = total − recebidoDireto
 *    A mesma regra vale na função `base_de_repasse` do banco (lida por
 *    `request_payout`), que é quem gera o valor a pagar de verdade — mudar só
 *    aqui deixaria a tela e o pagamento contando histórias diferentes.
 *  - TAXA DO DINHEIRO (OS-416, 16/11/2026): numa venda em dinheiro NA MAQUININHA
 *    (decisão do Gabriel de 16/11, "Só a maquininha": a venda manual em dinheiro
 *    fica como antes) o produtor fica com tudo o que o comprador pagou, e a
 *    parte que é da FestPag é "pago − valor do ingresso para o produtor": no
 *    lote normal, a taxa que o
 *    comprador pagou (OS-412); no lote "Sem taxa" (decisão do Gabriel de 16/11,
 *    "Porta segue o lote"), a taxa que o banco já tirou da face (OS-426). Ela
 *    entra em `recebidoDireto` (o que ele tem na mão = o que o comprador pagou)
 *    e sai do repasse, a mesma conta de `taxa_do_dinheiro_do_pedido` no banco.
 *    A conta "repasse = total − recebidoDireto" continua valendo.
 *  - A taxa de conveniência NÃO é um número de resumo: vive só no card do pedido.
 *  - Vendas de portaria (door_sales) são conferência — não entram aqui.
 */

export interface FinanceOrder {
  id?: string;
  status: string;
  total_amount: number | string;
  service_fee_amount?: number | string | null;
  sale_origin?: string | null;
  /** 'cash' na maquininha; 'pix'/'card…' no online. Opcional: quem não seleciona
   *  a coluna simplesmente não separa dinheiro (comportamento antigo). */
  payment_method?: string | null;
  /** Na venda manual é aqui que mora a forma ('dinheiro', 'pix', 'cartao'…). */
  manual_payment_method?: string | null;
  /**
   * Valor do ingresso para o produtor, calculado pelo banco (RPC
   * `producer_order_values`). Quando presente, é ELE que vale — a conta
   * `total − taxa` só entra como reserva para pedido que não passou pela RPC.
   */
  producer_value?: number | string | null;
}

export const isPaidStatus = (status: string): boolean =>
  status === 'paid' || status === 'completed';

/**
 * Pedido recebido em espécie. Duas portas, porque o dado mora em lugares
 * diferentes: a maquininha grava `payment_method='cash'`; a venda manual grava
 * a forma em `manual_payment_method='dinheiro'`.
 */
export function isCashOrder(o: FinanceOrder): boolean {
  const method = (o.payment_method || '').toLowerCase();
  if (method === 'cash' || method === 'dinheiro') return true;
  const manual = (o.manual_payment_method || '').toLowerCase();
  return manual === 'dinheiro';
}

export function saleOrigin(o: FinanceOrder): 'online' | 'fisica' | 'manual' | 'courtesy' {
  const v = o.sale_origin;
  if (v === 'manual' || v === 'courtesy') return v;
  if (v === 'smartpos') return 'fisica'; // venda no totem físico / SmartPOS
  return 'online';
}

/**
 * Valor do ingresso do pedido para o produtor: face, sem taxa de conveniência e
 * sem juro (nos lotes "Sem taxa", também sem a taxa de serviço que ele paga).
 * Prefere o valor vindo do banco (`producer_value`); sem ele, cai na conta
 * antiga `total − taxa` — correta para tudo que não é cartão parcelado do Marcel
 * nem lote "Sem taxa".
 */
export function orderTicketNet(o: FinanceOrder): number {
  if (o.producer_value != null && o.producer_value !== '') {
    const v = Number(o.producer_value);
    if (Number.isFinite(v)) return v;
  }
  return Number(o.total_amount || 0) - Number(o.service_fee_amount || 0);
}

/** Venda que o produtor recebeu DIRETO (fora do caixa da FestPag): manual ou dinheiro. */
export function isReceivedDirectly(o: FinanceOrder): boolean {
  return saleOrigin(o) === 'manual' || isCashOrder(o);
}

/**
 * Venda em dinheiro NA MAQUININHA (`sale_origin` 'smartpos' e `payment_method`
 * 'cash'): a única cuja taxa sai do repasse (OS-416, decisão do Gabriel de 16/11,
 * "Só a maquininha"). É o mesmo critério das funções `taxa_do_dinheiro_do_pedido`,
 * `taxa_do_dinheiro`, `admin_platform_net` e `reembolso_valores` no banco.
 */
export function isDinheiroDaMaquininha(o: Pick<FinanceOrder, 'sale_origin' | 'payment_method'>): boolean {
  const method = (o.payment_method || '').toLowerCase();
  return (o.sale_origin || 'online') === 'smartpos' && (method === 'cash' || method === 'dinheiro');
}

/**
 * Taxa das vendas em DINHEIRO de um pedido (OS-416): o que o produtor tem na mão
 * além do que é dele = pago (`total_amount`) − valor do ingresso para o produtor
 * (o do banco, `producer_value`; sem ele, `total − taxa`), nunca negativo. Lote
 * normal: a taxa do comprador. Lote "Sem taxa": a taxa que o banco tira da face.
 * É da FestPag e sai do repasse: a MESMA conta da função
 * `taxa_do_dinheiro_do_pedido` do banco. Fora do dinheiro da maquininha (venda
 * manual inclusive), pedido não pago ou cortesia: 0.
 */
export function taxaDoDinheiroDoPedido(o: FinanceOrder): number {
  if (!isPaidStatus(o.status) || !isDinheiroDaMaquininha(o)) return 0;
  const v = Number(o.total_amount || 0) - orderTicketNet(o);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v * 100) / 100;
}

export interface ProducerFinanceSummary {
  /** Vendas online — internet (ingresso sem taxa), pagas, sem cortesia. */
  online: number;
  /** Venda física — totem/SmartPOS (ingresso sem taxa), pagas, sem cortesia. */
  fisica: number;
  /** Vendas manuais (ingresso sem taxa), pagas, sem cortesia. */
  manual: number;
  /** online + fisica + manual — tudo que o evento vendeu. */
  total: number;
  /** Parte do total recebida em espécie (qualquer origem). Está DENTRO do total e FORA do repasse. */
  dinheiro: number;
  /**
   * Tudo que o produtor recebeu direto, sem passar pela FestPag: a venda manual
   * inteira + o dinheiro das outras origens + a taxa do dinheiro (OS-416). Os
   * ingressos estão DENTRO do total; tudo isso fica FORA do repasse.
   */
  recebidoDireto: number;
  /** Taxa das vendas em dinheiro: ficou com o produtor e sai do repasse (OS-416). */
  taxaDoDinheiro: number;
  /** O que a FestPag tem a repassar: total − recebidoDireto. */
  repasse: number;
  onlineCount: number;
  fisicaCount: number;
  manualCount: number;
  dinheiroCount: number;
  recebidoDiretoCount: number;
  paidCount: number;
}

export function computeProducerFinance(
  orders: FinanceOrder[] | null | undefined,
): ProducerFinanceSummary {
  const s: ProducerFinanceSummary = {
    online: 0, fisica: 0, manual: 0, total: 0, dinheiro: 0, recebidoDireto: 0, taxaDoDinheiro: 0, repasse: 0,
    onlineCount: 0, fisicaCount: 0, manualCount: 0, dinheiroCount: 0, recebidoDiretoCount: 0,
    paidCount: 0,
  };
  for (const o of orders || []) {
    if (!isPaidStatus(o.status)) continue;
    const origin = saleOrigin(o);
    if (origin === 'courtesy') continue;
    const net = orderTicketNet(o);
    s.paidCount += 1;
    if (origin === 'manual') { s.manual += net; s.manualCount += 1; }
    else if (origin === 'fisica') { s.fisica += net; s.fisicaCount += 1; }
    else { s.online += net; s.onlineCount += 1; }
    // Dinheiro atravessa as três origens: é uma parcela do total, não um balde
    // à parte. Por isso soma aqui e é descontado só do repasse.
    if (isCashOrder(o)) { s.dinheiro += net; s.dinheiroCount += 1; }
    // O que ficou na mão do produtor (manual inteira + dinheiro das outras).
    if (isReceivedDirectly(o)) { s.recebidoDireto += net; s.recebidoDiretoCount += 1; }
    // No dinheiro ele ficou também com a taxa, que é da FestPag: entra no que ele
    // tem na mão e, por isso, sai do repasse (OS-416).
    const taxa = taxaDoDinheiroDoPedido(o);
    if (taxa > 0) { s.taxaDoDinheiro += taxa; s.recebidoDireto += taxa; }
  }
  s.total = s.online + s.fisica + s.manual;
  s.repasse = Math.max(0, s.total - s.recebidoDireto);
  return s;
}

// ── Quebra por lote ─────────────────────────────────────────────────────────

export interface FinanceLot {
  id: string;
  name: string;
  price: number | string;
  total_quantity: number;
  is_active?: boolean | null;
}

export interface FinanceTicket {
  order_id: string;
  lot_id: string | null;
  status: string;
}

export interface SalesByLotRow {
  id: string;
  name: string;
  price: number;
  totalQuantity: number;
  soldQuantity: number;
  availableQuantity: number;
  revenue: number;
  progress: number;
  isActive: boolean | null | undefined;
}

/**
 * Ingressos vendidos e receita por lote. Receita = rateio do valor do ingresso
 * (sem taxa) do pedido entre seus tickets pagos. Cortesia conta como vendida
 * (ocupa estoque) mas com receita 0.
 */
export function computeSalesByLot(input: {
  orders: FinanceOrder[] | null | undefined;
  tickets: FinanceTicket[] | null | undefined;
  lots: FinanceLot[] | null | undefined;
}): SalesByLotRow[] {
  const paidTickets = (input.tickets || []).filter(
    (t) => t.status === 'valid' || t.status === 'used',
  );

  const ticketsPerOrder = new Map<string, number>();
  paidTickets.forEach((t) => {
    ticketsPerOrder.set(t.order_id, (ticketsPerOrder.get(t.order_id) || 0) + 1);
  });

  // net por pedido pago; cortesia = 0 (ocupa estoque mas não é receita)
  const netByOrder = new Map<string, number>();
  (input.orders || []).forEach((o) => {
    if (!o.id || !isPaidStatus(o.status)) return;
    netByOrder.set(o.id, saleOrigin(o) === 'courtesy' ? 0 : orderTicketNet(o));
  });

  return (input.lots || []).map((lot) => {
    const lotTickets = paidTickets.filter((t) => t.lot_id === lot.id);
    const revenue = lotTickets.reduce((sum, t) => {
      const orderNet = netByOrder.get(t.order_id);
      const count = ticketsPerOrder.get(t.order_id) || 0;
      if (orderNet == null || count === 0) return sum;
      return sum + orderNet / count;
    }, 0);
    const progress = lot.total_quantity > 0 ? (lotTickets.length / lot.total_quantity) * 100 : 0;

    return {
      id: lot.id,
      name: lot.name,
      price: Number(lot.price),
      totalQuantity: lot.total_quantity,
      soldQuantity: lotTickets.length,
      availableQuantity: lot.total_quantity - lotTickets.length,
      revenue,
      progress,
      isActive: lot.is_active,
    };
  });
}
