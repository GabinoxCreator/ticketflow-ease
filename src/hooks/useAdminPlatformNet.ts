import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * `gross` e `net`: taxa que está na mão da FestPag. `cashFee` (OS-416): taxa das
 * vendas em dinheiro na maquininha, que ficou com o produtor e sai do repasse dele.
 */
export type PlatformNet = { gross: number; mpCost: number; net: number; cashFee: number };

export function useAdminPlatformNet() {
  return useQuery({
    queryKey: ['admin-platform-net'],
    queryFn: async (): Promise<PlatformNet> => {
      const { data, error } = await (supabase.rpc as any)('admin_platform_net');
      if (error) throw error;
      const obj = (data ?? {}) as Partial<PlatformNet>;
      return {
        gross: Number(obj.gross) || 0,
        mpCost: Number(obj.mpCost) || 0,
        net: Number(obj.net) || 0,
        cashFee: Number(obj.cashFee) || 0,
      };
    },
  });
}
