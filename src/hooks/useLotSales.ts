import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Vendidos e cortesias por lote: o número de "vendidos" do painel do produtor.
 *
 * Vem da função `lot_sales_counts` do banco, que conta os ingressos válidos/usados
 * de pedido pago e separa a cortesia. Decisão do Gabriel em 02/10/2026: cortesia
 * NÃO conta como vendido, aparece à parte ("242 vendidos · 5 cortesias").
 *
 * Não usar `event_lots.sold_quantity` como "vendidos" na tela: aquele contador é o
 * controle de estoque, soma cortesia e pode ficar com sobra de venda cancelada
 * (na 5ª Confra do Bem dizia 248; de verdade eram 242 pagos + 5 cortesias).
 */
export interface LotSales {
  vendidos: number;
  cortesias: number;
}

const ZERO: LotSales = { vendidos: 0, cortesias: 0 };

/** Mapa lot_id → vendidos/cortesias. Lote sem ingresso não aparece no mapa (= zero). */
export async function fetchLotSales(eventIds: string[]): Promise<Map<string, LotSales>> {
  const byLot = new Map<string, LotSales>();
  if (eventIds.length === 0) return byLot;

  // cast: types.ts é auto-gerado e ainda não tem a função.
  const { data, error } = await (supabase.rpc as any)('lot_sales_counts', { p_event_ids: eventIds });
  if (error) throw new Error(`Não foi possível contar os ingressos vendidos: ${error.message}`);

  for (const row of (data || []) as { lot_id: string; vendidos: number; cortesias: number }[]) {
    byLot.set(row.lot_id, { vendidos: Number(row.vendidos) || 0, cortesias: Number(row.cortesias) || 0 });
  }
  return byLot;
}

export function lotSalesOf(byLot: Map<string, LotSales> | undefined, lotId: string): LotSales {
  return byLot?.get(lotId) ?? ZERO;
}

/** Soma de vários lotes (o evento inteiro, ou só os lotes informados). */
export function sumLotSales(byLot: Map<string, LotSales> | undefined, lotIds?: string[]): LotSales {
  const total = { vendidos: 0, cortesias: 0 };
  if (!byLot) return total;
  const ids = lotIds ?? Array.from(byLot.keys());
  for (const id of ids) {
    const s = byLot.get(id);
    if (s) {
      total.vendidos += s.vendidos;
      total.cortesias += s.cortesias;
    }
  }
  return total;
}

/**
 * Enquanto a contagem não chegou (carregando ou falhou), `data` fica vazio e a
 * tela mostra "—" em vez de número: em número de venda, tela sem número é melhor
 * que tela errada. Não amarrar o "carregando" da página a esta consulta: quando
 * ela falha, cada aba que abre tenta de novo, e a página inteira voltaria para o
 * esqueleto a cada tentativa (achado na prova da OS-108).
 */
export function useLotSales(eventIds: string[]) {
  const ids = [...new Set(eventIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ['lot-sales', ...ids],
    queryFn: () => fetchLotSales(ids),
    enabled: ids.length > 0,
    retry: 1,
  });
}
