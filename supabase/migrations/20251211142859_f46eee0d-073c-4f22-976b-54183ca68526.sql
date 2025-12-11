-- Add fake scarcity columns to events table
ALTER TABLE public.events 
ADD COLUMN fake_scarcity_enabled boolean DEFAULT false,
ADD COLUMN fake_scarcity_percentage integer DEFAULT 50;