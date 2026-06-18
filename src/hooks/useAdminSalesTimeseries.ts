import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DailyPoint = { dia: string; gmv: number };
export type HourlyPoint = { hora: number; pedidos: number };

export function useAdminSalesTimeseries() {
  return useQuery({
    queryKey: ['admin-sales-timeseries'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_sales_timeseries');
      if (error) throw error;
      const obj = (data ?? {}) as { daily?: DailyPoint[]; hourly?: HourlyPoint[] };
      return {
        daily: Array.isArray(obj.daily)
          ? obj.daily.map((d) => ({ dia: String(d.dia), gmv: Number(d.gmv) || 0 }))
          : [],
        hourly: Array.isArray(obj.hourly)
          ? obj.hourly.map((h) => ({ hora: Number(h.hora), pedidos: Number(h.pedidos) || 0 }))
          : [],
      };
    },
  });
}
