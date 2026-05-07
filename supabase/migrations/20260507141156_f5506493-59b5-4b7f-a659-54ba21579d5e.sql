REVOKE EXECUTE ON FUNCTION public.apply_order_approved(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_order_approved(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_order_approved(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_approved(uuid, text) TO service_role;