// De qual pixel da Meta é esta página de evento.
//
// O pixel vem de RPC pública dedicada (`get_event_tracking`) porque
// `producer_profiles` tem RLS fechada para anônimos — lendo pelo embed, o site
// público recebia null. A RPC já filtra por `tracking_enabled` e pixel não-nulo:
// se voltar vazio, é porque o produtor não quer (ou não configurou) rastreio.
//
// ⚠️ 26/10/2026 (OS-306) — O PIXEL GUARDADO É SEMPRE DE UM EVENTO.
// Andar de um evento para outro NÃO remonta a tela: é a mesma rota
// (`/evento/:id`), então este gancho continua vivo e, enquanto a consulta do
// evento novo não volta, o pixel guardado ainda é o do evento ANTERIOR. Como a
// tela dispara assim que tem evento e pixel, ela mandava `PageView` e
// `ViewContent` DO EVENTO NOVO para o PIXEL DO PRODUTOR ANTERIOR: o Gerenciador
// de um cliente recebendo a página de outro. Medido com janela de verdade em
// `.claude/skills/rodar-app/prova-os306-dois-produtores.mjs`.
// Por isso o pixel só sai daqui quando é DESTE evento; na troca, sai `null`, e
// quem usa simplesmente não dispara até a resposta certa chegar.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useEventPixel(eventId: string | null | undefined): string | null {
  const [resolvido, setResolvido] = useState<{ pixelId: string | null; doEvento: string | null }>({
    pixelId: null,
    doEvento: null,
  });

  useEffect(() => {
    if (!eventId) return;
    let cancelado = false;
    supabase
      .rpc('get_event_tracking', { _event_id: eventId })
      .then(({ data }) => {
        if (cancelado) return;
        const row = Array.isArray(data) ? data[0] : null;
        setResolvido({ pixelId: row?.meta_pixel_id ?? null, doEvento: eventId });
      });
    return () => { cancelado = true; };
  }, [eventId]);

  return resolvido.doEvento && resolvido.doEvento === eventId ? resolvido.pixelId : null;
}
