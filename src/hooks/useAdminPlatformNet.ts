import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PlatformNet = { gross: number; mpCost: number; net: number };

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
      };
    },
  });
}
