Migration: create `admin_mark_payout_paid` read-write function for the admin repasses panel.

## What this does
- Adds a single database function `public.admin_mark_payout_paid(p_payout_id uuid)` that lets an admin mark a payout as paid.
- No new tables, no schema changes to `payouts`, no RLS changes, no storage/Edge Function changes.

## SQL migration (exact)

```sql
CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(p_payout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  -- Admin guard
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  -- Lock row
  SELECT status INTO v_status
  FROM public.payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  -- Not found
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_not_found');
  END IF;

  -- Invalid status
  IF v_status <> 'requested' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'current_status', v_status);
  END IF;

  -- Mark as paid
  UPDATE public.payouts
  SET status = 'paid',
      paid_at = now()
  WHERE id = p_payout_id;

  RETURN jsonb_build_object('ok', true, 'id', p_payout_id, 'status', 'paid', 'paid_at', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
```

## Behaviour
- Only users with the `admin` role can execute this function. Others get a `not_admin` exception.
- The function locks the payout row (`FOR UPDATE`) to prevent race conditions during concurrent admin actions.
- If the payout does not exist, it returns `{"ok": false, "error": "payout_not_found"}`.
- If the payout status is not `requested`, it returns `{"ok": false, "error": "invalid_status", "current_status": "..."}`.
- On success, it updates `status` to `paid` and `paid_at` to `now()`, then returns `{"ok": true, "id": "...", "status": "paid", "paid_at": "..."}`.
- Does not modify `receipt_url`, `net_amount`, or any balance calculation.

## Access
- Revoked from `public`.
- Granted to `authenticated` (the internal admin guard enforces the actual permission).