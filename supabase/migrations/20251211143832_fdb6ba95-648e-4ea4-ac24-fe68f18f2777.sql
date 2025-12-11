-- Add fake scarcity columns to event_lots table
ALTER TABLE public.event_lots 
ADD COLUMN IF NOT EXISTS fake_scarcity_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fake_scarcity_percentage integer DEFAULT 50;