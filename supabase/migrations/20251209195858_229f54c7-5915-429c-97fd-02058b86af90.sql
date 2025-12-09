-- Create table for producer Stripe accounts
CREATE TABLE public.producer_stripe_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  stripe_account_id TEXT,
  stripe_account_status TEXT NOT NULL DEFAULT 'pending',
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  pin_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.producer_stripe_accounts ENABLE ROW LEVEL SECURITY;

-- Producers can view their own stripe account
CREATE POLICY "Produtores podem ver sua conta Stripe"
ON public.producer_stripe_accounts
FOR SELECT
USING (auth.uid() = user_id);

-- Producers can insert their own stripe account
CREATE POLICY "Produtores podem criar sua conta Stripe"
ON public.producer_stripe_accounts
FOR INSERT
WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'produtor'::app_role));

-- Producers can update their own stripe account
CREATE POLICY "Produtores podem atualizar sua conta Stripe"
ON public.producer_stripe_accounts
FOR UPDATE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_producer_stripe_accounts_updated_at
BEFORE UPDATE ON public.producer_stripe_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();