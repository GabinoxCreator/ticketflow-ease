// Quem produz este evento e como falar com ele, para o cartão da página do evento.
//
// Vem de RPC pública dedicada (`produtor_do_evento`) pelo mesmo motivo do
// `useEventPixel`: `producer_profiles` tem RLS fechada para anônimos, e pelo
// embed de `events` o comprador sem login recebia null.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ProdutorDoEvento = {
  brand_name: string;
  logo_url: string | null;
  email: string | null;
  phone: string | null;
};

export function useProdutorDoEvento(eventId: string | null | undefined) {
  return useQuery({
    queryKey: ['produtor-do-evento', eventId],
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProdutorDoEvento | null> => {
      const { data, error } = await (supabase as any).rpc('produtor_do_evento', { _event_id: eventId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return row?.brand_name ? (row as ProdutorDoEvento) : null;
    },
  });
}
