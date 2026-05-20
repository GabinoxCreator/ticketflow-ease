
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.slugify(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(public.unaccent(coalesce(_input, ''))),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
$$;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS slug text;

DO $$
DECLARE
  r RECORD;
  base text;
  candidate text;
  suffix text;
BEGIN
  FOR r IN SELECT id, title FROM public.events WHERE slug IS NULL OR slug = '' LOOP
    base := NULLIF(public.slugify(r.title), '');
    IF base IS NULL THEN base := 'evento'; END IF;
    candidate := base;
    IF EXISTS (SELECT 1 FROM public.events WHERE slug = candidate AND id <> r.id) THEN
      suffix := substr(replace(r.id::text, '-', ''), 1, 6);
      candidate := base || '-' || suffix;
    END IF;
    UPDATE public.events SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS events_slug_key ON public.events (slug);

CREATE OR REPLACE FUNCTION public.events_set_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  suffix text;
  i int := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' OR (TG_OP = 'UPDATE' AND NEW.title <> OLD.title AND NEW.slug = OLD.slug) THEN
    base := NULLIF(public.slugify(NEW.title), '');
    IF base IS NULL THEN base := 'evento'; END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.events WHERE slug = candidate AND id <> NEW.id) LOOP
      i := i + 1;
      IF i = 1 THEN
        suffix := substr(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 1, 6);
        candidate := base || '-' || suffix;
      ELSE
        candidate := base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      END IF;
      EXIT WHEN i > 5;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS events_set_slug_trigger ON public.events;
CREATE TRIGGER events_set_slug_trigger
BEFORE INSERT OR UPDATE OF title, slug ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.events_set_slug();
