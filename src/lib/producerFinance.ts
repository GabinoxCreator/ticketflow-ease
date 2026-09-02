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
 *  - "Valor do ingresso (sem taxa)" de um pedido = total_amount − service_fee_amount.
 *      · o desconto de cupom já está abatido em total_amount;
 *      · a taxa de conveniência pertence à PLATAFORMA, não ao produtor — por isso sai.
 *  - Três baldes de origem, todos com a mesma regra de valor:
 *      · online = sale_origin 'online' (ou null tratado como online) — venda pela internet;
 *      · fisica = sale_origin 'smartpos' — venda no totem físico / SmartPOS;
 *      · manual = sale_origin 'manual' — registro manual do produtor.
 *  - Total = online + fisica + manual (é tudo que o evento vendeu).
 *  - DINHEIRO NÃO ENTRA NO REPASSE (decisão do Gabriel, 02/09/2026). Venda em
 *    espécie nunca passou pela FestPag: o dinheiro ficou na mão de quem vendeu.
 *    Ele continua CONTADO nas vendas (o produtor precisa enxergar o que vendeu),
 *    mas sai do que a FestPag tem a pagar:
 *        repasse = total − dinheiro
 *    A mesma regra vale na função `request_payout` do banco, que é quem gera o
 *    valor a pagar de verdade — mudar só aqui deixaria a tela e o pagamento
 *    contando histórias diferentes.
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

/** Valor do ingresso do pedido, sem a taxa de conveniência (= repasse ao produtor). */
export function orderTicketNet(o: FinanceOrder): number {
  return Number(o.total_amount || 0) - Number(o.service_fee_amount || 0);
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
  /** Parte do total recebida em espécie. Está DENTRO do total e FORA do repasse. */
  dinheiro: number;
  /** O que a FestPag tem a repassar: total − dinheiro. */
  repasse: number;
  onlineCount: number;
  fisicaCount: number;
  manualCount: number;
  dinheiroCount: number;
  paidCount: number;
}

export function computeProducerFinance(
  orders: FinanceOrder[] | null | undefined,
): ProducerFinanceSummary {
  const s: ProducerFinanceSummary = {
    online: 0, fisica: 0, manual: 0, total: 0, dinheiro: 0, repasse: 0,
    onlineCount: 0, fisicaCount: 0, manualCount: 0, dinheiroCount: 0, paidCount: 0,
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
  }
  s.total = s.online + s.fisica + s.manual;
  s.repasse = Math.max(0, s.total - s.dinheiro);
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
