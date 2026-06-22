CREATE POLICY "admin_select_payout_proofs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_insert_payout_proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_update_payout_proofs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_delete_payout_proofs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.admin_attach_payout_receipt(p_payout_id uuid, p_path text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_id
  FROM public.payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_not_found');
  END IF;

  UPDATE public.payouts
  SET receipt_url = p_path
  WHERE id = p_payout_id;

  RETURN jsonb_build_object('ok', true, 'id', p_payout_id, 'receipt_url', p_path);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_attach_payout_receipt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_attach_payout_receipt(uuid, text) TO authenticated;