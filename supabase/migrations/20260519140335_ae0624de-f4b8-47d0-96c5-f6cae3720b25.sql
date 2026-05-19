ALTER TABLE public.producer_profiles
  ADD COLUMN IF NOT EXISTS meta_pixel_id text,
  ADD COLUMN IF NOT EXISTS tracking_enabled boolean NOT NULL DEFAULT false;