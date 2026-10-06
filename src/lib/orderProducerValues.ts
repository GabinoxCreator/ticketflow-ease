/**
 * orderProducerValues — pede ao banco o valor do ingresso de cada pedido
 * PARA O PRODUTOR (face, sem taxa de conveniência e sem juro de parcela).
 *
 * POR QUE NO BANCO E NÃO AQUI
 * A face de cada venda mora em `order_line_face`, gravada no ato da compra.
 * O produtor não enxerga essa tabela (RLS), e a conta "total − taxa" que o
 * painel fazia sozinho dava ao produtor o JURO do cartão parcelado da rota do
 * Marcel (Oktoberfest, 08/09/2026: R$ 23.129,53 quebrados num evento de
 * ingresso a R$ 200). A fórmula única é `order_producer_value`, no banco — a
 * mesma que `request_payout` usa para gerar o valor a pagar. A RPC
 * `producer_order_values` só a serve em lote.
 *
 * FALHA ALTO DE PROPÓSITO
 * Se a RPC não responder, quem chama recebe o erro e a tela mostra que não
 * conseguiu calcular — em vez de cair na conta antiga e exibir um número
 * errado com cara de certo. Em dinheiro, tela sem número é melhor que tela
 * mentindo.
 */
import { supabase } from '@/integrations/supabase/client';

const CHUNK = 500;

export type WithProducerValue<T> = T & { producer_value: number | null };

export async function attachProducerValues<T extends { id: string }>(
  orders: T[],
): Promise<WithProducerValue<T>[]> {
  if (orders.length === 0) return [];

  const values = new Map<string, number>();
  for (let i = 0; i < orders.length; i += CHUNK) {
    const ids = orders.slice(i, i + CHUNK).map((o) => o.id);
    const { data, error } = await supabase.rpc('producer_order_values', { p_order_ids: ids });
    if (error) {
      throw new Error(`Não foi possível calcular o valor dos ingressos: ${error.message}`);
    }
    for (const row of data || []) {
      if (row.producer_value != null) values.set(row.order_id, Number(row.producer_value));
    }
  }

  return orders.map((o) => ({ ...o, producer_value: values.get(o.id) ?? null }));
}

const ORDERS_PAGE = 1000;

export interface PaidOrderRow {
  id: string;
  event_id: string;
  status: string;
  total_amount: number;
  service_fee_amount: number | null;
  sale_origin: string | null;
  created_at: string;
}

/**
 * Pedidos pagos (paid/completed) dos eventos, já com o valor de face de cada um.
 * É o que alimenta a receita do início do painel e da lista "Meus Eventos" — a
 * mesma conta do painel do evento (OS-136, 06/10/2026).
 *
 * Paginado: o banco devolve no máximo 1000 linhas por consulta, e um produtor
 * com vários eventos passa disso sem aviso (a soma sairia menor, calada).
 */
export async function fetchPaidOrdersWithProducerValue(
  eventIds: string[],
): Promise<WithProducerValue<PaidOrderRow>[]> {
  if (eventIds.length === 0) return [];
  const rows: PaidOrderRow[] = [];
  for (let from = 0; ; from += ORDERS_PAGE) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, event_id, status, total_amount, service_fee_amount, sale_origin, created_at')
      .in('event_id', eventIds)
      .in('status', ['paid', 'completed'])
      .order('id')
      .range(from, from + ORDERS_PAGE - 1);
    if (error) throw new Error(`Não foi possível ler os pedidos pagos: ${error.message}`);
    rows.push(...((data || []) as PaidOrderRow[]));
    if (!data || data.length < ORDERS_PAGE) break;
  }
  return attachProducerValues(rows);
}
