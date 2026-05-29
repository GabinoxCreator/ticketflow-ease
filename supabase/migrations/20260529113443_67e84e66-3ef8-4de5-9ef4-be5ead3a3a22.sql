ALTER TABLE public.event_seats DROP CONSTRAINT IF EXISTS event_seats_status_check;
ALTER TABLE public.event_seats
  ADD CONSTRAINT event_seats_status_check
  CHECK (status IN ('available','held','sold','blocked','manual'));

ALTER TABLE public.event_seats
  ADD COLUMN IF NOT EXISTS manual_holder_name  text,
  ADD COLUMN IF NOT EXISTS manual_holder_phone text,
  ADD COLUMN IF NOT EXISTS manual_holder_notes text;