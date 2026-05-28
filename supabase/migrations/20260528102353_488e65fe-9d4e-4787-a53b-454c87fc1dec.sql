
-- 1. event_type em events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'ingresso'
    CHECK (event_type IN ('ingresso', 'mesa', 'hibrido'));
CREATE INDEX IF NOT EXISTS idx_events_event_type ON public.events(event_type);
COMMENT ON COLUMN public.events.event_type IS
  'Modelo de venda: ingresso (lotes), mesa (mapa de reservas) ou hibrido (ambos). NAO confundir com events.category (genero do evento).';

-- 2. VENUES
CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  state text,
  capacity integer,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venues_producer ON public.venues(producer_id) WHERE is_active = true;
COMMENT ON TABLE public.venues IS 'Locais fisicos cadastrados pelo produtor para reutilizar em multiplos eventos.';

GRANT SELECT ON public.venues TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venues TO authenticated;
GRANT ALL ON public.venues TO service_role;

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venues_public_select_active" ON public.venues
  FOR SELECT USING (is_active = true);
CREATE POLICY "venues_owner_all" ON public.venues
  FOR ALL TO authenticated USING (producer_id = auth.uid())
  WITH CHECK (producer_id = auth.uid());

-- 3. SEAT_TYPES
CREATE TABLE IF NOT EXISTS public.seat_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  base_capacity integer NOT NULL CHECK (base_capacity > 0),
  max_capacity integer NOT NULL CHECK (max_capacity >= base_capacity),
  base_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  extra_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
  shape text NOT NULL DEFAULT 'rect' CHECK (shape IN ('rect', 'circle')),
  default_width integer NOT NULL DEFAULT 80,
  default_height integer NOT NULL DEFAULT 80,
  default_color text DEFAULT '#3b82f6',
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seat_types_producer ON public.seat_types(producer_id) WHERE is_active = true;
COMMENT ON TABLE public.seat_types IS 'Tipos de assento cadastrados pelo produtor. Template para venue_seats.';

GRANT SELECT ON public.seat_types TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seat_types TO authenticated;
GRANT ALL ON public.seat_types TO service_role;

ALTER TABLE public.seat_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seat_types_public_select_active" ON public.seat_types
  FOR SELECT USING (is_active = true);
CREATE POLICY "seat_types_owner_all" ON public.seat_types
  FOR ALL TO authenticated USING (producer_id = auth.uid())
  WITH CHECK (producer_id = auth.uid());

-- 4. VENUE_SEATS (table_map_id FK adicionada depois)
CREATE TABLE IF NOT EXISTS public.venue_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  table_map_id uuid,
  seat_type_id uuid NOT NULL REFERENCES public.seat_types(id),
  code text NOT NULL,
  label text,
  x integer NOT NULL DEFAULT 0,
  y integer NOT NULL DEFAULT 0,
  width integer,
  height integer,
  radius integer,
  rotation integer NOT NULL DEFAULT 0,
  custom_base_capacity integer,
  custom_max_capacity integer,
  custom_base_price numeric(10,2),
  custom_extra_price numeric(10,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, code)
);
CREATE INDEX IF NOT EXISTS idx_venue_seats_venue ON public.venue_seats(venue_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_venue_seats_seat_type ON public.venue_seats(seat_type_id);
COMMENT ON TABLE public.venue_seats IS 'Assentos posicionados no mapa do venue. Pode sobrescrever capacidade/preco do seat_type.';

GRANT SELECT ON public.venue_seats TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_seats TO authenticated;
GRANT ALL ON public.venue_seats TO service_role;

ALTER TABLE public.venue_seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_seats_public_select_active" ON public.venue_seats
  FOR SELECT USING (is_active = true);
CREATE POLICY "venue_seats_owner_all" ON public.venue_seats
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_seats.venue_id AND v.producer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_seats.venue_id AND v.producer_id = auth.uid()));

-- 5. TABLE_MAPS
CREATE TABLE IF NOT EXISTS public.table_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  canvas_width integer NOT NULL DEFAULT 1200,
  canvas_height integer NOT NULL DEFAULT 800,
  background_color text DEFAULT '#ffffff',
  background_image_url text,
  orientation text NOT NULL DEFAULT 'landscape' CHECK (orientation IN ('landscape', 'portrait')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_table_maps_venue ON public.table_maps(venue_id) WHERE is_active = true;
COMMENT ON TABLE public.table_maps IS 'Canvas do mapa de reservas vinculado a um venue.';

ALTER TABLE public.venue_seats
  ADD CONSTRAINT fk_venue_seats_table_map
  FOREIGN KEY (table_map_id) REFERENCES public.table_maps(id) ON DELETE CASCADE;

GRANT SELECT ON public.table_maps TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_maps TO authenticated;
GRANT ALL ON public.table_maps TO service_role;

ALTER TABLE public.table_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "table_maps_public_select_active" ON public.table_maps
  FOR SELECT USING (is_active = true);
CREATE POLICY "table_maps_owner_all" ON public.table_maps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = table_maps.venue_id AND v.producer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = table_maps.venue_id AND v.producer_id = auth.uid()));

-- 6. MAP_OBJECTS
CREATE TABLE IF NOT EXISTS public.map_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_map_id uuid NOT NULL REFERENCES public.table_maps(id) ON DELETE CASCADE,
  object_type text NOT NULL CHECK (object_type IN ('text','rect','circle','line','icon','image')),
  x integer NOT NULL DEFAULT 0,
  y integer NOT NULL DEFAULT 0,
  width integer,
  height integer,
  rotation integer NOT NULL DEFAULT 0,
  text_content text,
  font_size integer DEFAULT 14,
  fill_color text DEFAULT '#cccccc',
  stroke_color text DEFAULT '#000000',
  stroke_width integer DEFAULT 1,
  icon_name text,
  image_url text,
  z_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_objects_map ON public.map_objects(table_map_id) WHERE is_active = true;
COMMENT ON TABLE public.map_objects IS 'Objetos decorativos do mapa (palco, bar, textos, icones).';

GRANT SELECT ON public.map_objects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_objects TO authenticated;
GRANT ALL ON public.map_objects TO service_role;

ALTER TABLE public.map_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_objects_public_select_active" ON public.map_objects
  FOR SELECT USING (is_active = true);
CREATE POLICY "map_objects_owner_all" ON public.map_objects
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.table_maps tm JOIN public.venues v ON v.id = tm.venue_id WHERE tm.id = map_objects.table_map_id AND v.producer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.table_maps tm JOIN public.venues v ON v.id = tm.venue_id WHERE tm.id = map_objects.table_map_id AND v.producer_id = auth.uid()));

-- 7. events.venue_id + events.table_map_id
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS table_map_id uuid REFERENCES public.table_maps(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_events_venue ON public.events(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_table_map ON public.events(table_map_id) WHERE table_map_id IS NOT NULL;
COMMENT ON COLUMN public.events.venue_id IS 'Venue fisico usado quando event_type IN (mesa, hibrido).';
COMMENT ON COLUMN public.events.table_map_id IS 'Mapa do venue usado nesse evento. NULL se event_type = ingresso.';

-- 8. EVENT_SEATS
CREATE TABLE IF NOT EXISTS public.event_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  venue_seat_id uuid NOT NULL REFERENCES public.venue_seats(id),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','sold','blocked')),
  held_by_user_id uuid,
  hold_token text,
  hold_expires_at timestamptz,
  pending_order_id uuid,
  sold_order_id uuid,
  manually_closed_by uuid REFERENCES auth.users(id),
  manually_closed_at timestamptz,
  manual_close_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, venue_seat_id)
);
CREATE INDEX IF NOT EXISTS idx_event_seats_status ON public.event_seats(event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_seats_hold_expires ON public.event_seats(hold_expires_at) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_event_seats_pending_order ON public.event_seats(pending_order_id) WHERE pending_order_id IS NOT NULL;
COMMENT ON TABLE public.event_seats IS 'Instancias de assento por evento. pending_order_id e sold_order_id sao links logicos (sem FK). Publicada via supabase_realtime.';

GRANT SELECT ON public.event_seats TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_seats TO authenticated;
GRANT ALL ON public.event_seats TO service_role;

ALTER TABLE public.event_seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_seats_public_select" ON public.event_seats
  FOR SELECT USING (true);
CREATE POLICY "event_seats_producer_owner_all" ON public.event_seats
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_seats.event_id AND e.producer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_seats.event_id AND e.producer_id = auth.uid()));

-- 9. EVENT_SEAT_PRICING
CREATE TABLE IF NOT EXISTS public.event_seat_pricing (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  seat_types_enabled boolean NOT NULL DEFAULT true,
  global_base_multiplier numeric(5,2) DEFAULT 1.0 CHECK (global_base_multiplier > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.event_seat_pricing IS 'Configuracoes de preco por evento (multiplicador global). Override fino fica em venue_seats.custom_*.';

GRANT SELECT ON public.event_seat_pricing TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_seat_pricing TO authenticated;
GRANT ALL ON public.event_seat_pricing TO service_role;

ALTER TABLE public.event_seat_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_seat_pricing_public_select" ON public.event_seat_pricing
  FOR SELECT USING (true);
CREATE POLICY "event_seat_pricing_owner_all" ON public.event_seat_pricing
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_seat_pricing.event_id AND e.producer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_seat_pricing.event_id AND e.producer_id = auth.uid()));

-- 10. Triggers updated_at (reusa public.update_updated_at_column existente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venues_updated_at') THEN
    CREATE TRIGGER trg_venues_updated_at BEFORE UPDATE ON public.venues
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_seat_types_updated_at') THEN
    CREATE TRIGGER trg_seat_types_updated_at BEFORE UPDATE ON public.seat_types
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_seats_updated_at') THEN
    CREATE TRIGGER trg_venue_seats_updated_at BEFORE UPDATE ON public.venue_seats
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_table_maps_updated_at') THEN
    CREATE TRIGGER trg_table_maps_updated_at BEFORE UPDATE ON public.table_maps
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_event_seats_updated_at') THEN
    CREATE TRIGGER trg_event_seats_updated_at BEFORE UPDATE ON public.event_seats
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_event_seat_pricing_updated_at') THEN
    CREATE TRIGGER trg_event_seat_pricing_updated_at BEFORE UPDATE ON public.event_seat_pricing
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 11. Realtime em event_seats
ALTER TABLE public.event_seats REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'event_seats'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.event_seats';
  END IF;
END $$;
