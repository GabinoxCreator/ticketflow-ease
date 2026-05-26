import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveKpis {
  revenue: number;
  ticketsSold: number;
  ticketsAvailable: number;
  avgTicket: number;
}

export interface LiveFeedItem {
  id: string;
  source: 'online' | 'manual' | 'portaria';
  customer_name: string;
  lot_name: string;
  quantity: number;
  amount: number;
  created_at: string;
}

interface State {
  kpis: LiveKpis | null;
  recent: LiveFeedItem[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  lastUpdate: number;
}

export function useColaboradorLiveStats(
  eventId: string,
  collaboratorId: string,
  sessionToken: string,
  onSessionExpired?: () => void,
) {
  const [state, setState] = useState<State>({
    kpis: null,
    recent: [],
    loading: true,
    error: null,
    connected: false,
    lastUpdate: 0,
  });

  const refetch = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('collaborator-live-stats', {
        body: { event_id: eventId, collaborator_id: collaboratorId, session_token: sessionToken },
      });
      if (error) throw error;
      if ((data as any)?.session_expired) {
        onSessionExpired?.();
        return;
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      setState((s) => ({
        ...s,
        kpis: data.kpis,
        recent: data.recent,
        loading: false,
        error: null,
        lastUpdate: Date.now(),
      }));
    } catch (e: any) {
      setState((s) => ({ ...s, loading: false, error: e.message || 'Erro ao carregar' }));
    }
  }, [eventId, collaboratorId, sessionToken, onSessionExpired]);

  // initial + polling fallback
  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, 20_000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Realtime subscription — any signal triggers a refetch (cheap and consistent)
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    const trigger = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => refetch(), 600);
    };

    const channel = supabase
      .channel(`live-stats-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `event_id=eq.${eventId}` }, trigger)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets', filter: `event_id=eq.${eventId}` }, trigger)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `event_id=eq.${eventId}` }, trigger)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'door_sales', filter: `event_id=eq.${eventId}` }, trigger)
      .subscribe((status) => {
        setState((s) => ({ ...s, connected: status === 'SUBSCRIBED' }));
      });

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [eventId, refetch]);

  return { ...state, refetch };
}
