-- Create collaborator_sessions table for secure session management
CREATE TABLE public.collaborator_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(collaborator_id)
);

-- Enable RLS
ALTER TABLE public.collaborator_sessions ENABLE ROW LEVEL SECURITY;

-- No client-side access - only edge functions with service role can access
-- This is intentional - sessions are managed server-side only

-- Add index for faster token lookups
CREATE INDEX idx_collaborator_sessions_token_hash ON public.collaborator_sessions(session_token_hash);
CREATE INDEX idx_collaborator_sessions_expires_at ON public.collaborator_sessions(expires_at);

-- Add RLS policy for collaborator_credentials (deny all client access explicitly)
-- The table already has RLS enabled, but let's ensure no policies allow access