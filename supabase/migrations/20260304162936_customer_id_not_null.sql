-- Verify no orphan rows exist (safety check)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payments WHERE customer_id IS NULL) THEN
    RAISE EXCEPTION 'Orphan payments exist — cannot add NOT NULL constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM bookings WHERE customer_id IS NULL) THEN
    RAISE EXCEPTION 'Orphan bookings exist — cannot add NOT NULL constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM attendance WHERE customer_id IS NULL) THEN
    RAISE EXCEPTION 'Orphan attendance exist — cannot add NOT NULL constraint';
  END IF;
END $$;

-- Add NOT NULL constraints
ALTER TABLE payments ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE attendance ALTER COLUMN customer_id SET NOT NULL;
