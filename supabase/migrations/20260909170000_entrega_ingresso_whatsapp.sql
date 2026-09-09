-- ============================================================================
-- Ingresso pelo WhatsApp — BLOCO 3 (plano de 09/09/2026)
--
-- COMO FUNCIONA
--   Quando um pedido vira PAGO, um gatilho olha o comprador: se ele tem conta e
--   já provou o WhatsApp com código (`profiles.whatsapp_confirmado_em`), nasce
--   uma linha em `entregas_whatsapp`. Um cron de 1 em 1 minuto chama a edge
--   `entregar-ingressos-whatsapp`, que reivindica as linhas pendentes, monta a
--   mensagem (texto + uma imagem de QR por ingresso) e manda pela Evolution.
--   Falhou (servidor do WhatsApp fora, por exemplo)? A linha volta para a fila
--   com espera crescente, por até 24 h. Depois disso, desiste e registra.
--
--   Fica FORA das edges de pagamento de propósito: nenhuma das 12 edges que
--   aprovam pedido precisa de redeploy, e a entrega vale para todo caminho
--   (PIX, cartão, venda manual, maquininha, cortesia) — o gatilho é no banco.
--
--   Quem nunca confirmou o WhatsApp NÃO entra aqui. Para a Oktoberfest nada muda.
--
-- COMO VOLTAR ATRÁS
--   `DROP TRIGGER on_order_paid_agendar_whatsapp ON public.orders;` — para de
--   agendar; a fila que sobrou pode ser esvaziada com `update ... set status='desistiu'`.
--   O cron (seção 5) só entra DEPOIS de a edge estar publicada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A fila de entregas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entregas_whatsapp (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  destino             text NOT NULL,                     -- 55DDDNÚMERO
  status              text NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente', 'enviando', 'enviado', 'desistiu')),
  tentativas          integer NOT NULL DEFAULT 0,
  mensagens_enviadas  integer NOT NULL DEFAULT 0,        -- para não repetir o que já chegou numa nova tentativa
  proximo_em          timestamptz NOT NULL DEFAULT now(),
  ultimo_erro         text,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  enviado_em          timestamptz
);

COMMENT ON TABLE public.entregas_whatsapp IS
  'Fila de entrega do ingresso pelo WhatsApp (plano 09/09/2026). Nasce pelo gatilho on_order_paid_agendar_whatsapp; a edge entregar-ingressos-whatsapp consome. Só service role.';

CREATE INDEX IF NOT EXISTS idx_entregas_whatsapp_fila
  ON public.entregas_whatsapp (proximo_em)
  WHERE status = 'pendente';

ALTER TABLE public.entregas_whatsapp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entregas_whatsapp FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Pedido pago → entra na fila (se o comprador confirmou o WhatsApp)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agendar_entrega_whatsapp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _destino text;
BEGIN
  IF new.status <> 'paid' THEN RETURN new; END IF;
  IF TG_OP = 'UPDATE' AND old.status = 'paid' THEN RETURN new; END IF;
  IF new.user_id IS NULL THEN RETURN new; END IF;

  SELECT public.normalizar_whatsapp(p.whatsapp)
    INTO _destino
    FROM public.profiles p
   WHERE p.id = new.user_id
     AND p.whatsapp_confirmado_em IS NOT NULL;

  IF _destino IS NULL THEN RETURN new; END IF;

  INSERT INTO public.entregas_whatsapp (order_id, user_id, destino)
  VALUES (new.id, new.user_id, _destino)
  ON CONFLICT (order_id) DO NOTHING;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- A entrega pelo WhatsApp NUNCA pode derrubar a aprovação de um pagamento.
  RAISE WARNING 'agendar_entrega_whatsapp falhou para % : %', new.id, SQLERRM;
  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS on_order_paid_agendar_whatsapp ON public.orders;
CREATE TRIGGER on_order_paid_agendar_whatsapp
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.agendar_entrega_whatsapp();

-- ----------------------------------------------------------------------------
-- 3. A edge reivindica um lote (seguro contra dois crons ao mesmo tempo)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entregas_whatsapp_reivindicar(_limite integer DEFAULT 8)
RETURNS SETOF public.entregas_whatsapp
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Linha presa em "enviando" há mais de 10 min = a edge morreu no meio. Volta.
  UPDATE public.entregas_whatsapp
     SET status = 'pendente', atualizado_em = now()
   WHERE status = 'enviando' AND atualizado_em < now() - interval '10 minutes';

  RETURN QUERY
  UPDATE public.entregas_whatsapp e
     SET status = 'enviando', atualizado_em = now()
   WHERE e.id IN (
     SELECT id FROM public.entregas_whatsapp
      WHERE status = 'pendente' AND proximo_em <= now()
      ORDER BY criado_em
      LIMIT greatest(1, least(_limite, 50))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING e.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.entregas_whatsapp_reivindicar(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entregas_whatsapp_reivindicar(integer) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Onde ficam as imagens de QR (privado; a edge gera link assinado de 30 dias)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ingressos-whatsapp', 'ingressos-whatsapp', false, 1048576, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. O cron — RODAR SÓ DEPOIS DE A EDGE ESTAR PUBLICADA (senão é 404 por minuto)
-- ----------------------------------------------------------------------------
-- SELECT cron.schedule(
--   'entregar-ingressos-whatsapp-every-minute',
--   '* * * * *',
--   $cron$
--   SELECT net.http_post(
--     url := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/entregar-ingressos-whatsapp',
--     headers := jsonb_build_object(
--       'Content-Type','application/json',
--       'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)
--     ),
--     body := jsonb_build_object('source','cron')
--   );
--   $cron$
-- );
-- Para desligar: SELECT cron.unschedule('entregar-ingressos-whatsapp-every-minute');
