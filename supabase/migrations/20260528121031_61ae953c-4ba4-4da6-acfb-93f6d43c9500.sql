-- 1. Snapshot fields on events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS map_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS map_snapshot_at timestamptz;

-- 2. Denormalized resolved fields on event_seats
ALTER TABLE public.event_seats
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS x integer,
  ADD COLUMN IF NOT EXISTS y integer,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS radius integer,
  ADD COLUMN IF NOT EXISTS rotation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seat_type_id uuid REFERENCES public.seat_types(id),
  ADD COLUMN IF NOT EXISTS seat_type_name text,
  ADD COLUMN IF NOT EXISTS shape text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS base_capacity integer,
  ADD COLUMN IF NOT EXISTS max_capacity integer,
  ADD COLUMN IF NOT EXISTS base_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS extra_price numeric(10,2);

-- 3. Loosen FK to venue_seats so cascade-deletes from table_maps/venues
--    don't orphan/destroy published event_seats (data is now denormalized).
ALTER TABLE public.event_seats
  DROP CONSTRAINT IF EXISTS event_seats_venue_seat_id_fkey;

ALTER TABLE public.event_seats
  ADD CONSTRAINT event_seats_venue_seat_id_fkey
  FOREIGN KEY (venue_seat_id) REFERENCES public.venue_seats(id) ON DELETE SET NULL;

-- venue_seat_id can now be NULL after upstream delete
ALTER TABLE public.event_seats ALTER COLUMN venue_seat_id DROP NOT NULL;

-- 4. RPC: publish_event_with_snapshot
CREATE OR REPLACE FUNCTION public.publish_event_with_snapshot(_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event RECORD;
  _snapshot jsonb;
  _seats_created int := 0;
  _seat_count int := 0;
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

  -- Idempotent: already published
  IF _event.status = 'published' THEN
    RETURN jsonb_build_object('already_published', true, 'seats_created', 0);
  END IF;

  -- No map → just flip status (legacy ingresso flow)
  IF _event.table_map_id IS NULL THEN
    UPDATE public.events SET status = 'published', updated_at = now()
     WHERE id = _event_id;
    RETURN jsonb_build_object('already_published', false, 'seats_created', 0, 'has_map', false);
  END IF;

  -- Count active seats
  SELECT count(*) INTO _seat_count
    FROM public.venue_seats
   WHERE table_map_id = _event.table_map_id AND is_active = true;

  IF _seat_count = 0 THEN
    RAISE EXCEPTION 'no_seats' USING ERRCODE = 'P0001';
  END IF;

  -- Build snapshot JSONB
  SELECT jsonb_build_object(
    'version', 1,
    'taken_at', now(),
    'table_map', (
      SELECT to_jsonb(tm) - 'created_at' - 'updated_at'
        FROM public.table_maps tm
       WHERE tm.id = _event.table_map_id
    ),
    'map_objects', COALESCE((
      SELECT jsonb_agg(to_jsonb(mo) - 'created_at')
        FROM public.map_objects mo
       WHERE mo.table_map_id = _event.table_map_id AND mo.is_active = true
    ), '[]'::jsonb),
    'seats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'venue_seat_id', vs.id,
        'code', vs.code,
        'label', vs.label,
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

  -- Materialize event_seats with resolved values
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

  UPDATE public.events
     SET status = 'published',
         map_snapshot = _snapshot,
         map_snapshot_at = now(),
         updated_at = now()
   WHERE id = _event_id;

  RETURN jsonb_build_object(
    'already_published', false,
    'has_map', true,
    'seats_created', _seats_created,
    'seats_total', _seat_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_event_with_snapshot(uuid) TO authenticated;

-- 5. RPC: unpublish_event
CREATE OR REPLACE FUNCTION public.unpublish_event(_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event RECORD;
  _active_count int := 0;
  _deleted int := 0;
BEGIN
  SELECT id, producer_id, status
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

  IF _event.status <> 'published' THEN
    RETURN jsonb_build_object('already_unpublished', true, 'deleted', 0);
  END IF;

  SELECT count(*) INTO _active_count
    FROM public.event_seats
   WHERE event_id = _event_id
     AND status IN ('held', 'sold');

  IF _active_count > 0 THEN
    RAISE EXCEPTION 'has_active_seats' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.event_seats
   WHERE event_id = _event_id
     AND status IN ('available', 'blocked');
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  UPDATE public.events
     SET status = 'draft',
         updated_at = now()
   WHERE id = _event_id;

  RETURN jsonb_build_object('already_unpublished', false, 'deleted', _deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unpublish_event(uuid) TO authenticated;