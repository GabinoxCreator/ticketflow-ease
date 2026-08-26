-- O mapa de camarotes ganha um interruptor próprio, separado do evento.
--
-- POR QUE ISTO EXISTE (26/08/2026, Rodeo): hoje o mapa aparece no site quando o
-- evento está publicado e tem `table_map_id`. Não há meio-termo — publicar para
-- vender ingresso abre a venda de camarote junto. E o Rodeo precisa exatamente
-- do meio-termo: os ingressos vão ao ar esta semana, enquanto o camarote ainda
-- espera preço final, mapa conferido contra as escadas e a definição dos pisos
-- empresariais. Sem este interruptor a saída seria despublicar o evento inteiro
-- (matando a venda de ingresso) ou vender camarote antes da hora.
--
-- `DEFAULT true` é deliberado: todo evento que já existe continua exatamente
-- como está. Made in Brazil e Oktoberfest não mudam de comportamento ao rodar
-- isto. Só quem desligar o botão muda.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS seat_map_public boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.events.seat_map_public IS
  'Se o mapa de assentos/camarotes aparece no site. false = o produtor segue '
  'vendendo pelo painel (venda manual), mas o comprador não vê nem consegue '
  'reservar. Independente de events.status: dá para ter evento publicado com '
  'ingresso à venda e camarote escondido.';

-- ---------------------------------------------------------------------------
-- hold_seats — a porta de entrada da compra pública de assento
-- ---------------------------------------------------------------------------
-- Duas travas novas, as duas NO SERVIDOR. Esconder na tela não basta: quem
-- guardou o link do checkout ou chama a RPC direto passaria por cima.
--
--  1. `seat_map_public` — o interruptor acima.
--  2. ⚠️ ASSENTO SEM PREÇO NÃO SE VENDE SOZINHO. Os pisos empresariais do Rodeo
--     ficam sem valor de tabela porque o preço sai da negociação e é digitado na
--     venda manual. Sem esta trava, `quote_seat_total` faria
--     `GREATEST(0.01, 0 + 0)` e um camarote de patrocinador sairia por UM
--     CENTAVO no site. Não é hipótese: é o caminho que o código já percorre.
--
-- Assinatura idêntica à anterior — CREATE OR REPLACE preserva os privilégios.

CREATE OR REPLACE FUNCTION public.hold_seats(
  _event_id uuid,
  _seat_ids uuid[],
  _window   interval DEFAULT '00:10:00'::interval
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid         uuid := auth.uid();
  _token       text := gen_random_uuid()::text;
  _expires_at  timestamptz := now() + _window;
  _updated     int;
  _requested   int;
  _event_ok    boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF _seat_ids IS NULL OR array_length(_seat_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_seats_requested' USING ERRCODE = '22023';
  END IF;

  _requested := array_length(_seat_ids, 1);

  -- Publicado E com o mapa ligado. Um evento pode estar vendendo ingresso com
  -- o camarote fora do ar.
  SELECT EXISTS (
    SELECT 1 FROM public.events
     WHERE id = _event_id
       AND status = 'published'
       AND seat_map_public = true
  ) INTO _event_ok;

  IF NOT _event_ok THEN
    RAISE EXCEPTION 'event_not_available' USING ERRCODE = 'P0001';
  END IF;

  -- Sem preço de tabela, a unidade só sai pela venda manual do painel.
  IF EXISTS (
    SELECT 1 FROM public.event_seats
     WHERE event_id = _event_id
       AND id = ANY(_seat_ids)
       AND COALESCE(base_price, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'seat_without_price' USING ERRCODE = 'P0001';
  END IF;

  WITH upd AS (
    UPDATE public.event_seats
       SET status            = 'held',
           held_by_user_id   = _uid,
           hold_token        = _token,
           hold_expires_at   = _expires_at,
           updated_at        = now()
     WHERE event_id = _event_id
       AND id = ANY(_seat_ids)
       AND (
            status = 'available'
         OR (status = 'held' AND hold_expires_at < now())
       )
    RETURNING id
  )
  SELECT count(*) INTO _updated FROM upd;

  IF _updated <> _requested THEN
    RAISE EXCEPTION 'seats_unavailable' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'hold_token',  _token,
    'expires_at',  _expires_at,
    'seats',       to_jsonb(_seat_ids)
  );
END;
$function$;

-- ROLLBACK
--   ALTER TABLE public.events DROP COLUMN IF EXISTS seat_map_public;
--   (e recriar hold_seats sem os dois blocos novos — a versão anterior está no
--    histórico desta função)
