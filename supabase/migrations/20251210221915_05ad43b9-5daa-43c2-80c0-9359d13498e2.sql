-- Remove public access policies from email_verification_codes table
-- This table contains sensitive PII (emails, names, CPF numbers)

DROP POLICY IF EXISTS "Anyone can check verification codes" ON public.email_verification_codes;
DROP POLICY IF EXISTS "Anyone can insert verification codes" ON public.email_verification_codes;
DROP POLICY IF EXISTS "Anyone can update verification codes" ON public.email_verification_codes;

-- Only keep the delete policy for expired codes
-- The edge functions use service_role key and bypass RLS

-- Remove public INSERT policy from orders table
-- Order creation should only happen through edge functions with service_role

DROP POLICY IF EXISTS "Sistema pode criar pedidos" ON public.orders;