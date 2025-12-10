-- Create table for collaborator credentials (isolated from producers)
CREATE TABLE public.collaborator_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE CASCADE NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS but NO policies - only service_role can access
ALTER TABLE public.collaborator_credentials ENABLE ROW LEVEL SECURITY;

-- Migrate existing password hashes to new table
INSERT INTO public.collaborator_credentials (collaborator_id, password_hash)
SELECT id, password_hash FROM public.collaborators WHERE password_hash IS NOT NULL;

-- Remove password_hash column from collaborators table
ALTER TABLE public.collaborators DROP COLUMN password_hash;