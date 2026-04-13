-- Make ticket_id nullable to support guest list check-ins
ALTER TABLE public.checkin_logs ALTER COLUMN ticket_id DROP NOT NULL;

-- Add guest_entry_id column for guest list entries
ALTER TABLE public.checkin_logs ADD COLUMN guest_entry_id uuid REFERENCES public.guest_list_entries(id);