
-- 1. Create producer_member_role enum
CREATE TYPE public.producer_member_role AS ENUM ('owner', 'admin', 'manager', 'checkin', 'viewer');

-- 2. Create producer_profiles table
CREATE TABLE public.producer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  legal_name TEXT,
  document TEXT,
  email TEXT,
  phone TEXT,
  slug TEXT UNIQUE,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.producer_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create producer_members table
CREATE TABLE public.producer_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_profile_id UUID NOT NULL REFERENCES public.producer_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.producer_member_role NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(producer_profile_id, user_id)
);

ALTER TABLE public.producer_members ENABLE ROW LEVEL SECURITY;

-- 4. Add producer_profile_id to events
ALTER TABLE public.events ADD COLUMN producer_profile_id UUID REFERENCES public.producer_profiles(id);

-- 5. Helper functions (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_producer_member(_user_id UUID, _producer_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.producer_members
    WHERE user_id = _user_id
      AND producer_profile_id = _producer_profile_id
      AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_producer_admin(_user_id UUID, _producer_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.producer_members
    WHERE user_id = _user_id
      AND producer_profile_id = _producer_profile_id
      AND role IN ('owner', 'admin')
      AND status = 'active'
  )
$$;

-- 6. RLS policies for producer_profiles
CREATE POLICY "Members can view their organization"
ON public.producer_profiles FOR SELECT
TO authenticated
USING (
  public.is_producer_member(auth.uid(), id)
);

CREATE POLICY "Producers can create organization"
ON public.producer_profiles FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = auth.uid() AND public.has_role(auth.uid(), 'produtor')
);

CREATE POLICY "Admins can update organization"
ON public.producer_profiles FOR UPDATE
TO authenticated
USING (public.is_producer_admin(auth.uid(), id))
WITH CHECK (public.is_producer_admin(auth.uid(), id));

CREATE POLICY "Owner can delete organization"
ON public.producer_profiles FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());

-- 7. RLS policies for producer_members
CREATE POLICY "Members can view org members"
ON public.producer_members FOR SELECT
TO authenticated
USING (
  public.is_producer_member(auth.uid(), producer_profile_id)
);

CREATE POLICY "Admins can add members"
ON public.producer_members FOR INSERT
TO authenticated
WITH CHECK (
  public.is_producer_admin(auth.uid(), producer_profile_id)
);

CREATE POLICY "Admins can update members"
ON public.producer_members FOR UPDATE
TO authenticated
USING (public.is_producer_admin(auth.uid(), producer_profile_id));

CREATE POLICY "Admins can remove members"
ON public.producer_members FOR DELETE
TO authenticated
USING (public.is_producer_admin(auth.uid(), producer_profile_id));

-- 8. Additional event policy for org members
CREATE POLICY "Org members can view org events"
ON public.events FOR SELECT
TO authenticated
USING (
  producer_profile_id IS NOT NULL
  AND public.is_producer_member(auth.uid(), producer_profile_id)
);

-- 9. Triggers for updated_at
CREATE TRIGGER update_producer_profiles_updated_at
BEFORE UPDATE ON public.producer_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_producer_members_updated_at
BEFORE UPDATE ON public.producer_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
