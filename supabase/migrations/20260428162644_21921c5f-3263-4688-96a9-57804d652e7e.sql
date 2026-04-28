ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS event_id uuid NULL REFERENCES public.events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payouts_event_id ON public.payouts(event_id);