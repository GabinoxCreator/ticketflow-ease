import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  lojaDb,
  lerValor,
  type ProdutoDoCatalogoComGrade,
  type TipoDeProduto,
  type VarianteDoProduto,
} from '@/lib/loja/tipos';

export interface ProdutoFormData {
  kind: TipoDeProduto;
  name: string;
  color: string;
  description: string;
  base_price: string;
  image_url?: string;
  is_active: boolean;
  /** Rótulos da grade, na ordem da tela. Copo não tem. */
  variacoes: string[];
}

export function useProducerProducts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: produtos, isLoading } = useQuery({
    queryKey: ['producer-products', user?.id],
    queryFn: async (): Promise<ProdutoDoCatalogoComGrade[]> => {
      // O filtro por dono é obrigatório: a leitura pública também devolve
      // produto de OUTRO produtor que esteja à venda em evento publicado.
      const { data, error } = await lojaDb
        .from('producer_products')
        .select('*, variants:producer_product_variants(*)')
        .eq('producer_id', user!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['producer-products'] });
    // O painel do evento mostra nome, foto e grade vindos do catálogo.
    queryClient.invalidateQueries({ queryKey: ['loja-evento'] });
  };

  const salvarProduto = useMutation({
    mutationFn: async ({ id, data }: { id?: string | null; data: ProdutoFormData }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const payload = {
        kind: data.kind,
        name: data.name.trim(),
        color: data.kind === 'camiseta' ? data.color.trim() || null : null,
        description: data.description.trim() || null,
        image_url: data.image_url || null,
        base_price: lerValor(data.base_price),
        is_active: data.is_active,
      };

      let productId = id ?? null;
      if (productId) {
        const { error } = await lojaDb
          .from('producer_products')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', productId);
        if (error) throw error;
      } else {
        const { data: criado, error } = await lojaDb
          .from('producer_products')
          .insert({ ...payload, producer_id: user.id })
          .select('id')
          .single();
        if (error) throw error;
        productId = criado.id;
      }

      // A grade. Variação que sai da lista é DESATIVADA, nunca apagada: ela
      // pode estar em estoque de evento ou em pedido já vendido.
      const desejadas = data.kind === 'copo' ? [] : data.variacoes;
      const { data: atuais, error: erroGrade } = await lojaDb
        .from('producer_product_variants')
        .select('*')
        .eq('product_id', productId);
      if (erroGrade) throw erroGrade;

      const existentes: VarianteDoProduto[] = atuais ?? [];
      const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
      const novas: Array<{ product_id: string; label: string; sort_order: number }> = [];

      for (let ordem = 0; ordem < desejadas.length; ordem++) {
        const rotulo = desejadas[ordem].trim();
        const achada = existentes.find((v) => igual(v.label, rotulo));
        if (!achada) {
          novas.push({ product_id: productId!, label: rotulo, sort_order: ordem });
        } else if (!achada.is_active || achada.sort_order !== ordem) {
          const { error } = await lojaDb
            .from('producer_product_variants')
            .update({ is_active: true, sort_order: ordem })
            .eq('id', achada.id);
          if (error) throw error;
        }
      }

      if (novas.length > 0) {
        const { error } = await lojaDb.from('producer_product_variants').insert(novas);
        if (error) throw error;
      }

      const sairam = existentes
        .filter((v) => v.is_active && !desejadas.some((d) => igual(d, v.label)))
        .map((v) => v.id);
      if (sairam.length > 0) {
        const { error } = await lojaDb
          .from('producer_product_variants')
          .update({ is_active: false })
          .in('id', sairam);
        if (error) throw error;
      }
    },
    onSuccess: (_d, { id }) => {
      invalidar();
      toast.success(id ? 'Produto atualizado!' : 'Produto criado!');
    },
    onError: (e: Error) => {
      // A grade pode ter ficado pela metade: recarrega para a tela mostrar o que valeu.
      invalidar();
      toast.error('Erro ao salvar produto: ' + e.message);
    },
  });

  const alternarAtivo = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await lojaDb
        .from('producer_products')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, { is_active }) => {
      invalidar();
      toast.success(is_active ? 'Produto reativado!' : 'Produto desativado!');
    },
    onError: (e: Error) => toast.error('Erro ao atualizar produto: ' + e.message),
  });

  return { produtos, isLoading, salvarProduto, alternarAtivo };
}
