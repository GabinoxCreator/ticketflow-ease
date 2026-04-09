
-- 1. Add columns to producer_profiles
ALTER TABLE public.producer_profiles
  ADD COLUMN IF NOT EXISTS admin_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS platform_fee_percent numeric NOT NULL DEFAULT 10;

-- 2. platform_settings
CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select platform_settings" ON public.platform_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert platform_settings" ON public.platform_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update platform_settings" ON public.platform_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete platform_settings" ON public.platform_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. producer_fee_overrides
CREATE TABLE public.producer_fee_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_profile_id uuid NOT NULL REFERENCES public.producer_profiles(id) ON DELETE CASCADE,
  fee_percent numeric NOT NULL DEFAULT 10,
  fee_fixed numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.producer_fee_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select producer_fee_overrides" ON public.producer_fee_overrides FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert producer_fee_overrides" ON public.producer_fee_overrides FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update producer_fee_overrides" ON public.producer_fee_overrides FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete producer_fee_overrides" ON public.producer_fee_overrides FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. payouts
CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_profile_id uuid NOT NULL REFERENCES public.producer_profiles(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_amount numeric NOT NULL DEFAULT 0,
  platform_fee numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  bank_account_snapshot jsonb,
  paid_at timestamptz,
  receipt_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select payouts" ON public.payouts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert payouts" ON public.payouts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update payouts" ON public.payouts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete payouts" ON public.payouts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Producers can see their own payouts
CREATE POLICY "Producers can view own payouts" ON public.payouts FOR SELECT TO authenticated
  USING (public.is_producer_member(auth.uid(), producer_profile_id));

-- 5. producer_notes
CREATE TABLE public.producer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_profile_id uuid NOT NULL REFERENCES public.producer_profiles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.producer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select producer_notes" ON public.producer_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert producer_notes" ON public.producer_notes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. audit_logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Admin RLS on existing tables
CREATE POLICY "Admins can view all events" ON public.events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all tickets" ON public.tickets FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all producer_profiles" ON public.producer_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update producer_profiles" ON public.producer_profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all producer_bank_accounts" ON public.producer_bank_accounts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all user_roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all producer_members" ON public.producer_members FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8. Timestamp trigger for payouts
CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Seed default platform settings
INSERT INTO public.platform_settings (key, value) VALUES
  ('default_platform_fee_percent', '{"percent": 10, "fixed": 0}')
ON CONFLICT (key) DO NOTHING;
