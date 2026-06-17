CREATE OR REPLACE FUNCTION public.admin_list_payouts(p_status text DEFAULT NULL)
RETURNS TABLE (
  id                    uuid,
  status                text,
  net_amount            numeric,
  period_start          date,
  paid_at               timestamptz,
  receipt_url           text,
  produtor              text,
  evento                text,
  bank_account_snapshot jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.status,
    p.net_amount,
    p.period_start,
    p.paid_at,
    p.receipt_url,
    pp.brand_name AS produtor,
    e.title       AS evento,
    p.bank_account_snapshot
  FROM public.payouts p
  LEFT JOIN public.producer_profiles pp ON pp.id = p.producer_profile_id
  LEFT JOIN public.events            e  ON e.id  = p.event_id
  WHERE (p_status IS NULL OR p.status = p_status)
  ORDER BY p.period_start DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_payouts(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_list_payouts(text) TO authenticated;