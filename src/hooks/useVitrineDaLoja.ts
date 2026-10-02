import { useQuery } from '@tanstack/react-query';
import {
  lojaDbPublico,
  type ProdutoNoEvento,
  type ProdutoDoCatalogo,
  type VarianteDoProduto,
  type EstoqueDoProduto,
  type ComboDoEvento,
  type ItemDoCombo,
} from '@/lib/loja/tipos';

export interface ProdutoDaVitrine {
  ativacao: ProdutoNoEvento;
  produto: Pick<ProdutoDoCatalogo, 'id' | 'kind' | 'name' | 'color' | 'description' | 'image_url'>;
  /** Tamanhos que valem NESTE evento, na ordem da grade. Vazio = produto sem tamanho. */
  tamanhos: VarianteDoProduto[];
  estoques: EstoqueDoProduto[];
}

export interface ComboDaVitrine {
  combo: ComboDoEvento;
  itens: ItemDoCombo[];
}

export interface VitrineDaLoja {
  produtos: ProdutoDaVitrine[];
  combos: ComboDaVitrine[];
}

const VAZIA: VitrineDaLoja = { produtos: [], combos: [] };

/**
 * A loja do evento como o COMPRADOR vê: produtos e combos à venda, para a
 * página pública. (O painel do produtor lê por `useLojaDoEvento`.)
 *
 * ⚠️ NUNCA quebra a página do evento. A loja é um extra: se a leitura falhar
 * (inclusive enquanto as tabelas não existirem no banco, entre o publish e a
 * migration), o evento continua vendendo ingresso como sempre e a loja só não
 * aparece. Por isso todo erro vira loja vazia.
 */
export function useVitrineDaLoja(eventId: string | undefined, ligada: boolean) {
  return useQuery({
    queryKey: ['vitrine-da-loja', eventId],
    enabled: !!eventId && ligada,
    staleTime: 30_000,
    queryFn: async (): Promise<VitrineDaLoja> => {
      try {
        const { data: ativacoes, error: e1 } = await lojaDbPublico
          .from('event_products')
          .select('id, event_id, product_id, price, modo_taxa, fulfillment, fulfillment_info, status, sort_order')
          .eq('event_id', eventId)
          .eq('status', 'active')
          .order('sort_order');
        if (e1) return VAZIA;
        const eps = (ativacoes ?? []) as ProdutoNoEvento[];

        const { data: combosRaw, error: e5 } = await lojaDbPublico
          .from('event_bundles')
          .select('id, event_id, name, description, price, status, sort_order, image_url')
          .eq('event_id', eventId)
          .eq('status', 'active')
          .order('sort_order');
        const combosLidos = (e5 ? [] : combosRaw ?? []) as ComboDoEvento[];

        if (eps.length === 0 && combosLidos.length === 0) return VAZIA;

        const productIds = Array.from(new Set(eps.map((e) => e.product_id)));
        const epIds = eps.map((e) => e.id);
        const nada = Promise.resolve({ data: [] as any[], error: null as any });

        const [cat, vars, est, itensCombo] = await Promise.all([
          productIds.length
            ? lojaDbPublico.from('producer_products')
                .select('id, kind, name, color, description, image_url').in('id', productIds)
                // Desativado no catálogo sai de todos os eventos (o servidor também recusa).
                .eq('is_active', true)
            : nada,
          productIds.length
            ? lojaDbPublico.from('producer_product_variants')
                .select('id, product_id, label, sort_order, is_active').in('product_id', productIds)
                .eq('is_active', true).order('sort_order')
            : nada,
          epIds.length
            ? lojaDbPublico.from('event_product_stock')
                .select('id, event_product_id, variant_id, total_quantity, sold_quantity, reserved_quantity, is_active')
                .in('event_product_id', epIds).eq('is_active', true)
            : nada,
          combosLidos.length
            ? lojaDbPublico.from('event_bundle_items')
                .select('id, bundle_id, kind, lot_id, event_product_id, quantity, unit_face_share')
                .in('bundle_id', combosLidos.map((c) => c.id))
            : nada,
        ]);
        if (cat.error || vars.error || est.error) return VAZIA;

        const produtos: ProdutoDaVitrine[] = [];
        for (const ativacao of eps) {
          const produto = (cat.data ?? []).find((p: any) => p.id === ativacao.product_id);
          if (!produto) continue;
          const estoques = ((est.data ?? []) as EstoqueDoProduto[])
            .filter((s) => s.event_product_id === ativacao.id);
          if (estoques.length === 0) continue;
          const grade = ((vars.data ?? []) as VarianteDoProduto[])
            .filter((v) => v.product_id === ativacao.product_id);
          const porTamanho = estoques.filter((s) => s.variant_id);
          // Mesma regra do servidor: com estoque por tamanho, só os tamanhos que
          // têm linha; com estoque único, a grade inteira do produto.
          const tamanhos = porTamanho.length > 0
            ? grade.filter((v) => porTamanho.some((s) => s.variant_id === v.id))
            : grade;
          produtos.push({ ativacao, produto, tamanhos, estoques });
        }

        const combos: ComboDaVitrine[] = combosLidos
          .map((combo) => ({
            combo,
            itens: ((itensCombo.error ? [] : itensCombo.data ?? []) as ItemDoCombo[])
              .filter((i) => i.bundle_id === combo.id),
          }))
          // Combo cujo produto não está à venda não tem como ser entregue.
          .filter((c) => c.itens.length > 0 && c.itens.every((i) =>
            i.kind === 'lot' || produtos.some((p) => p.ativacao.id === i.event_product_id)));

        return { produtos, combos };
      } catch {
        return VAZIA;
      }
    },
  });
}

/** Linha de estoque de onde sai uma unidade deste tamanho (ou a única do produto). */
export function estoqueDoTamanho(p: ProdutoDaVitrine, variantId: string | null): EstoqueDoProduto | null {
  const doTamanho = variantId ? p.estoques.find((s) => s.variant_id === variantId) : null;
  return doTamanho ?? p.estoques.find((s) => !s.variant_id) ?? null;
}
