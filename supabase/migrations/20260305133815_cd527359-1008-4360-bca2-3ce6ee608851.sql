CREATE TABLE public.producer_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  bank_name text NOT NULL DEFAULT '',
  account_holder_name text NOT NULL DEFAULT '',
  agency text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  account_type text NOT NULL DEFAULT 'corrente',
  pix_key text NOT NULL DEFAULT '',
  pix_key_type text NOT NULL DEFAULT 'cpf',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.producer_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bank account"
  ON public.producer_bank_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bank account"
  ON public.producer_bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bank account"
  ON public.producer_bank_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);