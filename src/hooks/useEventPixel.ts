// De qual pixel da Meta é esta página de evento.
//
// O pixel vem de RPC pública dedicada (`get_event_tracking`) porque
// `producer_profiles` tem RLS fechada para anônimos — lendo pelo embed, o site
// público recebia null. A RPC já filtra por `tracking_enabled` e pixel não-nulo:
// se voltar vazio, é porque o produtor não quer (ou não configurou) rastreio.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useEventPixel(eventId: string | null | undefined): string | null {
  const [pixelId, setPixelId] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let cancelado = false;
    supabase
      .rpc('get_event_tracking', { _event_id: eventId })
      .then(({ data }) => {
        if (cancelado) return;
        const row = Array.isArray(data) ? data[0] : null;
        setPixelId(row?.meta_pixel_id ?? null);
      });
    return () => { cancelado = true; };
  }, [eventId]);

  return pixelId;
}
