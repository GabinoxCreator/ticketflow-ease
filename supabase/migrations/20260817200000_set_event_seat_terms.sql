-- ============================================================================
-- set_event_seat_terms — o produtor fecha os termos de UMA unidade
-- Data: 17/08/2026
--
-- PARA QUE
--   Venda de camarote é negociada, não tabelada. No Rodeio de Novo Horizonte o
--   piso define o padrão (Piso A R$9.000 com 10 ingressos por dia), mas o
--   comprador que quiser 15 ingressos paga um valor combinado na hora — decisão
--   do Gabriel em 17/08: "o produtor digita na hora".
--
-- ONDE ESCREVE, E POR QUÊ ISSO IMPORTA
--   Em `event_seats`, NUNCA em `venue_seats`. O combinado vale para ESTE evento;
--   o mapa base é reaproveitado em outros e não pode carregar o preço de uma
--   negociação específica.
--   E é justamente de `event_seats.base_price` / `base_capacity` que o checkout
--   de assento cobra — ou seja, o que o produtor fecha aqui é exatamente o que o
--   comprador paga. Não existe segunda fonte de verdade para divergir.
--
-- TRAVAS
--   · dono do evento ou admin (mesmo gate das outras RPCs de gestão);
--   · unidade `sold` ou `held` é RECUSADA (`seat_busy`): mudar preço ou tamanho
--     embaixo de quem já pagou, ou está pagando naquele instante, não pode
--     acontecer — é a mesma família do "não mexer no pedido em andamento";
--   · capacidade >= 1 e preço >= 0;
--   · `max_capacity` sobe junto quando a negociação passa do teto — sem isso o
--     combinado seria gravado e o checkout depois recusaria, deixando o produtor
--     com uma venda fechada que o sistema não deixa concluir.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_event_seat_terms(
  _seat_id uuid,
  _base_capacity integer,
  _base_price numeric,
  _extra_price numeric DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _seat RECORD;
  _dono boolean;
BEGIN
  SELECT s.id, s.event_id, s.status, s.max_capacity, e.producer_id
    INTO _seat
    FROM public.event_seats s
    JOIN public.events e ON e.id = s.event_id
   WHERE s.id = _seat_id
   FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seat_not_found' USING ERRCODE = 'P0002';
  END IF;

  _dono := _seat.producer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role);
  IF NOT _dono THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _seat.status IN ('sold', 'held') THEN
    RAISE EXCEPTION 'seat_busy' USING ERRCODE = 'P0001';
  END IF;

  IF _base_capacity IS NULL OR _base_capacity < 1 THEN
    RAISE EXCEPTION 'capacidade_invalida' USING ERRCODE = 'P0001';
  END IF;

  IF _base_price IS NULL OR _base_price < 0 THEN
    RAISE EXCEPTION 'preco_invalido' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.event_seats
     SET base_capacity = _base_capacity,
         max_capacity  = GREATEST(COALESCE(max_capacity, _base_capacity), _base_capacity),
         base_price    = _base_price,
         extra_price   = COALESCE(_extra_price, extra_price),
         updated_at    = now()
   WHERE id = _seat_id;

  RETURN jsonb_build_object(
    'ok', true,
    'seat_id', _seat_id,
    'base_capacity', _base_capacity,
    'base_price', _base_price
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_event_seat_terms(uuid, integer, numeric, numeric) TO authenticated;
