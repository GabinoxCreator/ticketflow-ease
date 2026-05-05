-- Bloco 2: Webhook Mercado Pago

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS mp_payment_id text;

CREATE INDEX IF NOT EXISTS orders_mp_payment_id_idx
  ON public.orders (mp_payment_id);

CREATE TABLE IF NOT EXISTS public.mp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id text NOT NULL,
  mp_status text NOT NULL,
  request_id text,
  order_id uuid,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS mp_webhook_events_dedupe_idx
  ON public.mp_webhook_events (mp_payment_id, mp_status);

CREATE INDEX IF NOT EXISTS mp_webhook_events_order_idx
  ON public.mp_webhook_events (order_id);

ALTER TABLE public.mp_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view mp_webhook_events"
  ON public.mp_webhook_events FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));