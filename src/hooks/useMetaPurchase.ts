// Dispara a COMPRA para o pixel do produtor, uma vez por pedido.
//
// Por que isto nasceu (29/09/2026): o site nunca teve evento de Purchase. Sem
// ele, a Meta sabe quem visitou mas nunca soube quem COMPROU — e aí a campanha
// não consegue otimizar por venda nem mostrar retorno. Era a peça que faltava
// para o produtor fazer tráfego de verdade.
//
// Duas telas terminam uma compra e as duas usam este hook: a volta do cartão
// (CheckoutSuccess) e a espera do PIX (PedidoStatus).
//
// O `eventID` mandado é o ID DO PEDIDO. É ele que casa com o evento que o nosso
// servidor manda pela API de Conversões, para a Meta contar UMA venda e não
// duas.
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { trackPurchase } from '@/lib/metaPixel';

interface PedidoPago {
  id: string;
  event_id: string | null | undefined;
  total_amount: number | string;
  status: string;
}

const chave = (orderId: string) => `fp_purchase_enviado_${orderId}`;

function jaEnviado(orderId: string): boolean {
  try {
    return sessionStorage.getItem(chave(orderId)) === '1';
  } catch {
    return false;
  }
}

function marcarEnviado(orderId: string) {
  try {
    sessionStorage.setItem(chave(orderId), '1');
  } catch {
    /* sem storage: no pior caso manda de novo, e a Meta deduplica pelo eventID */
  }
}

export function useMetaPurchase(order: PedidoPago | null | undefined) {
  const rodando = useRef(false);

  useEffect(() => {
    if (!order || order.status !== 'paid' || !order.event_id) return;
    if (rodando.current || jaEnviado(order.id)) return;
    rodando.current = true;

    let cancelado = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_event_tracking', { _event_id: order.event_id });
        const row = Array.isArray(data) ? data[0] : null;
        const pixelId = row?.meta_pixel_id ?? null;
        if (!pixelId || cancelado) return;

        trackPurchase(
          pixelId,
          {
            content_ids: [order.event_id as string],
            content_type: 'product',
            value: Number(order.total_amount) || 0,
            currency: 'BRL',
          },
          order.id,
        );
        marcarEnviado(order.id);
      } catch {
        /* rastreamento nunca pode atrapalhar a entrega do ingresso */
      } finally {
        rodando.current = false;
      }
    })();

    return () => { cancelado = true; };
  }, [order?.id, order?.status, order?.event_id]);
}
