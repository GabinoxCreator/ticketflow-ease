import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  lojaDb,
  type ComboCompleto,
  type ComprovanteCompleto,
  type ItemDeProdutoDoPedido,
  type ProdutoNoEventoCompleto,
} from '@/lib/loja/tipos';

// Tudo da loja de um evento mora debaixo desta chave: uma invalidação só
// recarrega produtos, pendências, combos e retiradas.
export const chaveDaLoja = (eventId: string) => ['loja-evento', eventId];

export function useInvalidarLoja(eventId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: chaveDaLoja(eventId) });
}

export function useProdutosDoEvento(eventId: string) {
  return useQuery({
    queryKey: [...chaveDaLoja(eventId), 'produtos'],
    queryFn: async (): Promise<ProdutoNoEventoCompleto[]> => {
      const { data, error } = await lojaDb
        .from('event_products')
        .select('*, product:producer_products(*, variants:producer_product_variants(*)), stock:event_product_stock(*)')
        .eq('event_id', eventId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });
}

export function useCombosDoEvento(eventId: string) {
  return useQuery({
    queryKey: [...chaveDaLoja(eventId), 'combos'],
    queryFn: async (): Promise<ComboCompleto[]> => {
      const { data, error } = await lojaDb
        .from('event_bundles')
        .select('*, items:event_bundle_items(*)')
        .eq('event_id', eventId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });
}

// O PostgREST corta a resposta em 1.000 linhas. Evento grande passa disso, e
// um resumo de camisetas contado pela metade manda fazer camiseta a menos.
const PAGINA = 1000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lerTudo<T>(montar: () => any): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montar().range(de, de + PAGINA - 1);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return linhas;
  }
}

export function useRetiradasDoEvento(eventId: string, eventProductIds: string[]) {
  const ids = [...eventProductIds].sort();
  return useQuery({
    queryKey: [...chaveDaLoja(eventId), 'retiradas', ids],
    queryFn: async () => {
      const comprovantes = await lerTudo<ComprovanteCompleto>(() =>
        lojaDb
          .from('product_claims')
          .select('*, order:orders(customer_name, customer_cpf)')
          .eq('event_id', eventId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true }),
      );

      // 'reserved' e 'released' ficam de fora: não são venda. 'returned' vem
      // para o comprovante cancelado ainda mostrar o que era o pedido.
      const itens = ids.length === 0
        ? []
        : await lerTudo<ItemDeProdutoDoPedido>(() =>
            lojaDb
              .from('order_product_items')
              .select('*')
              .in('event_product_id', ids)
              .in('stock_state', ['sold', 'returned'])
              .order('created_at', { ascending: true })
              .order('id', { ascending: true }),
          );

      return { comprovantes, itens };
    },
    enabled: !!eventId,
  });
}
