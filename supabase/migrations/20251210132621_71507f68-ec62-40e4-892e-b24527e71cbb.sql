-- Add CPF column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text;

-- Create index for CPF lookups
CREATE INDEX IF NOT EXISTS idx_profiles_cpf ON public.profiles(cpf);