-- Tabela para códigos OTP de recuperação de senha
CREATE TABLE public.password_reset_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_codes_email ON public.password_reset_codes(email);
CREATE INDEX idx_password_reset_codes_expires_at ON public.password_reset_codes(expires_at);

ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

-- Apenas service role (edge functions) acessa. Permite limpar expirados publicamente.
CREATE POLICY "Anyone can delete expired password reset codes"
  ON public.password_reset_codes
  FOR DELETE
  USING (expires_at < now());
