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
