import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Plus, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProducerProducts } from '@/hooks/useProducerProducts';
import { useInvalidarLoja } from '@/hooks/useLojaDoEvento';
import { lojaDb, nomeDoProduto, reais, type ProdutoNoEventoCompleto } from '@/lib/loja/tipos';
import { ProdutoDoEventoCard } from './ProdutoDoEventoCard';

interface Props {
  eventId: string;
  produtos: ProdutoNoEventoCompleto[];
}

export function ProdutosDoEvento({ eventId, produtos }: Props) {
  const { produtos: catalogo, isLoading: catalogoLoading } = useProducerProducts();
  const invalidar = useInvalidarLoja(eventId);
  const [escolhido, setEscolhido] = useState('');

  const jaNoEvento = new Set(produtos.map((p) => p.product_id));
  const disponiveis = (catalogo ?? []).filter((p) => p.is_active && !jaNoEvento.has(p.id));

  const adicionar = useMutation({
    mutationFn: async (productId: string) => {
      const produto = (catalogo ?? []).find((p) => p.id === productId);
      if (!produto) throw new Error('Produto não encontrado no catálogo');
      // Nasce SEMPRE como rascunho: o banco recusa produto que já entra à venda.
      const { error } = await lojaDb.from('event_products').insert({
        event_id: eventId,
        product_id: productId,
        price: produto.base_price,
        status: 'draft',
        sort_order: produtos.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEscolhido('');
      invalidar();
      toast.success('Produto adicionado ao evento. Falta completar e colocar à venda.');
    },
    onError: (e: Error) => toast.error('Erro ao adicionar produto: ' + e.message),
  });

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-xl font-bold">Produtos deste evento</h3>
        <p className="text-sm text-muted-foreground">
          Escolha um produto do seu catálogo, defina preço, quantidade e como o comprador recebe.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        {catalogoLoading ? (
          <p className="text-sm text-muted-foreground">Carregando seu catálogo...</p>
        ) : disponiveis.length > 0 ? (
          <>
            <Select value={escolhido} onValueChange={setEscolhido}>
              <SelectTrigger className="sm:flex-1">
                <SelectValue placeholder="Escolha um produto do catálogo" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {nomeDoProduto(p)}
                    {p.base_price != null ? ` (${reais(p.base_price)})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="hero"
              disabled={!escolhido || adicionar.isPending}
              onClick={() => adicionar.mutate(escolhido)}
            >
              <Plus className="w-4 h-4 mr-2" />
              {adicionar.isPending ? 'Adicionando...' : 'Adicionar ao evento'}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground flex-1">
            {(catalogo ?? []).length === 0
              ? 'Você ainda não tem produtos cadastrados.'
              : 'Todos os produtos ativos do seu catálogo já estão neste evento.'}
          </p>
        )}
        <Button variant="outline" asChild>
          <Link to="/produtor/produtos">Abrir meu catálogo</Link>
        </Button>
      </div>

      {produtos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <ShoppingBag className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">Nenhum produto neste evento</p>
          <p className="text-sm text-muted-foreground">
            Adicione uma camiseta ou um copo do seu catálogo para vender junto com os ingressos.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {produtos.map((ep) => (
            <ProdutoDoEventoCard key={ep.id} eventId={eventId} ep={ep} />
          ))}
        </div>
      )}
    </section>
  );
}
