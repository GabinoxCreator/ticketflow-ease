-- Create table to store email verification codes
CREATE TABLE public.email_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  name text,
  cpf text,
  expires_at timestamp with time zone NOT NULL,
  verified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_verification_email ON public.email_verification_codes(email);
CREATE INDEX idx_verification_expires ON public.email_verification_codes(expires_at);

-- Enable RLS but allow public access for verification
ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert verification codes (will be done by edge function)
CREATE POLICY "Anyone can insert verification codes"
ON public.email_verification_codes
FOR INSERT
WITH CHECK (true);

-- Allow anyone to select their own verification codes by email
CREATE POLICY "Anyone can check verification codes"
ON public.email_verification_codes
FOR SELECT
USING (true);

-- Allow updates to mark as verified
CREATE POLICY "Anyone can update verification codes"
ON public.email_verification_codes
FOR UPDATE
USING (true);

-- Cleanup old codes automatically (optional - via scheduled job)
CREATE POLICY "Anyone can delete expired codes"
ON public.email_verification_codes
FOR DELETE
USING (expires_at < now());