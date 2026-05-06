import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HealthSnapshot {
  id: string;
  captured_at: string;
  metrics: any;
  overall_severity: "ok" | "warn" | "crit";
  duration_ms: number | null;
}

export const useLatestHealthSnapshot = () => {
  return useQuery({
    queryKey: ["health-snapshot", "latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_health_snapshots")
        .select("*")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as HealthSnapshot | null;
    },
    refetchInterval: 30000,
  });
};

export const useRecentHealthSnapshots = (limit = 60) => {
  return useQuery({
    queryKey: ["health-snapshot", "recent", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_health_snapshots")
        .select("*")
        .order("captured_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as HealthSnapshot[];
    },
    refetchInterval: 30000,
  });
};

export const useHealthAlerts = () => {
  return useQuery({
    queryKey: ["health-snapshot", "alerts"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("system_health_snapshots")
        .select("*")
        .gte("captured_at", since)
        .in("overall_severity", ["warn", "crit"])
        .order("captured_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as HealthSnapshot[];
    },
    refetchInterval: 60000,
  });
};
