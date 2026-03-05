ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check CHECK (status IN ('pending', 'valid', 'used', 'cancelled'));

UPDATE tickets SET status = 'pending' WHERE order_id IN (SELECT id FROM orders WHERE status = 'pending');