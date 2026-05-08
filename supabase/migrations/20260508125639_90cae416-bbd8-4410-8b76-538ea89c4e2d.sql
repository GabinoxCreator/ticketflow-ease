-- NEUTRALIZED 2026-05-08
-- Original content executed apply_order_approved() with a hardcoded order id
-- as a one-off operational reconciliation. It must NOT replay on remix or
-- restore (would mutate production data based on a hardcoded UUID).
-- The fix has already been applied. This file is kept as a no-op only to
-- preserve the migration ordering.
SELECT 1;
