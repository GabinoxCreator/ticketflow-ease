import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// O banco não deixa apagar evento que tem pedido, ingresso ou venda de portaria
// (gatilho trg_evento_com_pedido_nao_se_apaga, OS-266). A tela pergunta a mesma
// coisa antes de oferecer o "Excluir" (OS-408): qualquer pedido conta, de qualquer
// situação, até o vencido. Só conta: não traz linha nenhuma.
export function useEventoTemPedido(eventId?: string | null, ligado = true) {
  return useQuery({
    queryKey: ['evento-tem-pedido', eventId],
    enabled: !!eventId && ligado,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<boolean> => {
      const conta = async (tabela: 'orders' | 'tickets' | 'door_sales') => {
        const { count, error } = await supabase
          .from(tabela)
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId!);
        if (error) throw error;
        return count ?? 0;
      };
      const [pedidos, ingressos, portaria] = await Promise.all([
        conta('orders'),
        conta('tickets'),
        conta('door_sales'),
      ]);
      return pedidos + ingressos + portaria > 0;
    },
  });
}

/** A frase que a tela mostra no lugar do botão "Excluir". */
export const EVENTO_COM_PEDIDO_NAO_SE_EXCLUI =
  'Evento com pedido não se exclui. Para tirar do ar, despublique.';
