import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Este produtor vê a loja (menu Produtos e aba Produtos no evento)?
 *
 * Decisão do Gabriel em 01/10/2026: a loja nasceu para a Porcada do Amor e
 * fica **escondida** para os outros produtores até amadurecer — aba que
 * ninguém sabe para que serve vira dúvida e suporte. Liberar outro produtor é
 * um UPDATE em `producer_profiles.loja_habilitada`, não um deploy.
 *
 * ⚠️ Isto é só a VITRINE DO PAINEL. A página pública não depende desta chave:
 * lá a loja já só aparece quando o evento tem produto ativo.
 */
export function useLojaHabilitada() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['loja-habilitada', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      // cast: a RPC é nova e o types.ts gerado ainda não a conhece.
      const { data, error } = await (supabase.rpc as any)('loja_habilitada');
      if (error) return false;
      return data === true;
    },
  });

  return { lojaHabilitada: data === true, carregando: isLoading };
}
