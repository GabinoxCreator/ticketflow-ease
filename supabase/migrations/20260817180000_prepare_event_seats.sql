-- ============================================================================
-- prepare_event_seats — materializar o mapa SEM publicar o evento
-- Data: 17/08/2026
--
-- O PROBLEMA
--   Os assentos de um evento (event_seats) só nasciam dentro de
--   `publish_event_with_snapshot`, ou seja: a única forma de ter camarote no
--   evento era PUBLICAR. Mas a venda de camarote começa pelo canal interno —
--   no Rodeio de Novo Horizonte, ~70% das unidades são fechadas pelo produtor
--   antes de a venda abrir ao público (framework §9).
--
--   Com as duas coisas na mesma função, o produtor ficava num beco: ou publicava
--   o evento (abrindo a venda no site antes da hora) ou não tinha o que
--   gerenciar, porque a aba de mesas lê `event_seats` e ela vinha vazia.
--
-- O QUE ESTA FUNÇÃO FAZ
--   O mesmo que a publish faz com o mapa — monta o snapshot e materializa os
--   assentos — e NADA MAIS. Não encosta em `events.status`.
--
-- POR QUE É SEGURA
--   · Só ADIÇÃO: nova função, nenhuma existente foi alterada. A publish segue
--     idêntica e continua sendo o único caminho que publica.
--   · Mesmas validações de dono/admin da publish.
--   · Idempotente por `ON CONFLICT (event_id, venue_seat_id) DO NOTHING`:
--     rodar de novo só acrescenta assento novo, nunca mexe em preço editado,
--     unidade vendida ou nome de comprador já gravado.
--   · O snapshot NÃO é regravado quando existe assento `held`/`sold` — ele é a
--     foto do mapa que a pessoa viu ao comprar, e trocá-la por baixo de uma
--     reserva mudaria lugar ou preço de quem já pagou.
--
-- PROVADO EM PRODUÇÃO (17/08, evento 53a35128 do rodeio, em draft)
--   1ª chamada  → seats_created 100, snapshot gravado, status segue 'draft'
--   2ª chamada  → seats_created 0 (idempotente), 100 códigos únicos, sem duplicata
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prepare_event_seats(_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _event RECORD;
  _snapshot jsonb;
  _seats_created int := 0;
  _seat_count int := 0;
  _ocupados int := 0;
BEGIN
  SELECT id, producer_id, status, table_map_id
    INTO _event
    FROM public.events
   WHERE id = _event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF _event.producer_id <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _event.table_map_id IS NULL THEN
    RAISE EXCEPTION 'no_map' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO _seat_count
    FROM public.venue_seats
   WHERE table_map_id = _event.table_map_id AND is_active = true;

  IF _seat_count = 0 THEN
    RAISE EXCEPTION 'no_seats' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO _ocupados
    FROM public.event_seats
   WHERE event_id = _event_id AND status IN ('held', 'sold');

  IF _ocupados = 0 THEN
    SELECT jsonb_build_object(
      'version', 1,
      'taken_at', now(),
      'table_map', (
        SELECT to_jsonb(tm) - 'created_at' - 'updated_at'
          FROM public.table_maps tm WHERE tm.id = _event.table_map_id
      ),
      'map_objects', COALESCE((
        SELECT jsonb_agg(to_jsonb(mo) - 'created_at')
          FROM public.map_objects mo
         WHERE mo.table_map_id = _event.table_map_id AND mo.is_active = true
      ), '[]'::jsonb),
      'seats', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'venue_seat_id', vs.id,
          'code', vs.code, 'label', vs.label,
          'x', vs.x, 'y', vs.y,
          'width', vs.width, 'height', vs.height, 'radius', vs.radius,
          'rotation', vs.rotation,
          'seat_type_id', st.id,
          'seat_type', jsonb_build_object(
            'name', st.name, 'shape', st.shape,
            'default_color', st.default_color, 'icon', st.icon,
            'base_capacity', st.base_capacity, 'max_capacity', st.max_capacity,
            'base_price', st.base_price, 'extra_price', st.extra_price
          ),
          'resolved', jsonb_build_object(
            'base_capacity', COALESCE(vs.custom_base_capacity, st.base_capacity),
            'max_capacity',  COALESCE(vs.custom_max_capacity,  st.max_capacity),
            'base_price',    COALESCE(vs.custom_base_price,    st.base_price),
            'extra_price',   COALESCE(vs.custom_extra_price,   st.extra_price)
          )
        ))
          FROM public.venue_seats vs
          JOIN public.seat_types st ON st.id = vs.seat_type_id
         WHERE vs.table_map_id = _event.table_map_id AND vs.is_active = true
      ), '[]'::jsonb)
    ) INTO _snapshot;

    UPDATE public.events
       SET map_snapshot = _snapshot, map_snapshot_at = now(), updated_at = now()
     WHERE id = _event_id;
  END IF;

  INSERT INTO public.event_seats (
    event_id, venue_seat_id, status,
    code, label, x, y, width, height, radius, rotation,
    seat_type_id, seat_type_name, shape, color, icon,
    base_capacity, max_capacity, base_price, extra_price
  )
  SELECT
    _event_id, vs.id, 'available',
    vs.code, vs.label, vs.x, vs.y, vs.width, vs.height, vs.radius, vs.rotation,
    st.id, st.name, st.shape, st.default_color, st.icon,
    COALESCE(vs.custom_base_capacity, st.base_capacity),
    COALESCE(vs.custom_max_capacity,  st.max_capacity),
    COALESCE(vs.custom_base_price,    st.base_price),
    COALESCE(vs.custom_extra_price,   st.extra_price)
  FROM public.venue_seats vs
  JOIN public.seat_types st ON st.id = vs.seat_type_id
  WHERE vs.table_map_id = _event.table_map_id AND vs.is_active = true
  ON CONFLICT (event_id, venue_seat_id) DO NOTHING;

  GET DIAGNOSTICS _seats_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'seats_created',    _seats_created,
    'seats_total',      _seat_count,
    'snapshot_gravado', _ocupados = 0,
    'ocupados',         _ocupados,
    'status',           _event.status
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.prepare_event_seats(uuid) TO authenticated;
