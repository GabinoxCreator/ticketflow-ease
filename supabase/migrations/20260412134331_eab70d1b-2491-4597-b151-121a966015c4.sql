-- Add end_date and end_time to events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS end_time time without time zone;

-- Make category nullable with default
ALTER TABLE public.events
  ALTER COLUMN category DROP NOT NULL,
  ALTER COLUMN category SET DEFAULT 'Outros';

-- Add new columns to event_lots
ALTER TABLE public.event_lots
  ADD COLUMN IF NOT EXISTS sector_name text NOT NULL DEFAULT 'Ingresso',
  ADD COLUMN IF NOT EXISTS group_ticket_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_ticket_quantity integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS sales_start_type text NOT NULL DEFAULT 'now',
  ADD COLUMN IF NOT EXISTS starts_after_lot_id uuid REFERENCES public.event_lots(id) ON DELETE SET NULL;