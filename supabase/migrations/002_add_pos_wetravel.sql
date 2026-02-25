-- ============================================================
-- TailorLoom Migration 002: Add POS + WeTravel support
-- Adds new source types, renames columns to be source-agnostic,
-- adds attribution fields, and creates insight_config table.
-- ============================================================

-- ============================================================
-- 1. Enum changes
-- ============================================================
ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'pos';
ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'wetravel';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'approved';

-- ============================================================
-- 2. Customers table: rename name → full_name, add country
-- ============================================================
ALTER TABLE customers RENAME COLUMN name TO full_name;
ALTER TABLE customers ADD COLUMN country TEXT;

-- ============================================================
-- 3. Payments table: source-agnostic columns
-- ============================================================
-- Rename stripe_payment_id → external_payment_id
ALTER TABLE payments RENAME COLUMN stripe_payment_id TO external_payment_id;

-- Add source column
ALTER TABLE payments ADD COLUMN source TEXT NOT NULL DEFAULT 'stripe';

-- Add payment_type column
ALTER TABLE payments ADD COLUMN payment_type TEXT;

-- Drop stripe_customer_id and description
ALTER TABLE payments DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE payments DROP COLUMN IF EXISTS description;

-- Drop old unique index and create new one
DROP INDEX IF EXISTS idx_payments_stripe_payment_id;
CREATE UNIQUE INDEX idx_payments_org_source_external_id
  ON payments(org_id, source, external_payment_id)
  WHERE external_payment_id IS NOT NULL;

-- ============================================================
-- 4. Bookings table: source-agnostic columns + attribution
-- ============================================================
-- Rename calendly_event_id → external_booking_id
ALTER TABLE bookings RENAME COLUMN calendly_event_id TO external_booking_id;

-- Add source column
ALTER TABLE bookings ADD COLUMN source TEXT NOT NULL DEFAULT 'calendly';

-- Add date range fields
ALTER TABLE bookings ADD COLUMN start_date DATE;
ALTER TABLE bookings ADD COLUMN end_date DATE;

-- Add attribution fields
ALTER TABLE bookings ADD COLUMN lead_source_channel TEXT;
ALTER TABLE bookings ADD COLUMN utm_source TEXT;
ALTER TABLE bookings ADD COLUMN utm_medium TEXT;
ALTER TABLE bookings ADD COLUMN utm_campaign TEXT;
ALTER TABLE bookings ADD COLUMN utm_content TEXT;
ALTER TABLE bookings ADD COLUMN referrer TEXT;
ALTER TABLE bookings ADD COLUMN referral_partner TEXT;
ALTER TABLE bookings ADD COLUMN lead_capture_method TEXT;

-- Drop old unique index and create new one
DROP INDEX IF EXISTS idx_bookings_calendly_event_id;
CREATE UNIQUE INDEX idx_bookings_org_source_external_id
  ON bookings(org_id, source, external_booking_id)
  WHERE external_booking_id IS NOT NULL;

-- ============================================================
-- 5. Attendance table: source-agnostic columns
-- ============================================================
-- Rename passline_id → external_attendance_id
ALTER TABLE attendance RENAME COLUMN passline_id TO external_attendance_id;

-- Add source column
ALTER TABLE attendance ADD COLUMN source TEXT NOT NULL DEFAULT 'passline';

-- Add ticket_type column
ALTER TABLE attendance ADD COLUMN ticket_type TEXT;

-- Drop old unique index and create new one
DROP INDEX IF EXISTS idx_attendance_passline_id;
CREATE UNIQUE INDEX idx_attendance_org_source_external_id
  ON attendance(org_id, source, external_attendance_id)
  WHERE external_attendance_id IS NOT NULL;

-- ============================================================
-- 6. New table: insight_config
-- ============================================================
CREATE TABLE insight_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  churn_days INTEGER NOT NULL DEFAULT 90,
  high_value_threshold NUMERIC(12, 2) NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO insight_config (org_id)
VALUES ('00000000-0000-0000-0000-000000000001');

-- Updated_at trigger
CREATE TRIGGER set_updated_at_insight_config
  BEFORE UPDATE ON insight_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE insight_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access insight_config"
  ON insight_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
