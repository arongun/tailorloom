-- ============================================================
-- TailorLoom Milestone 1: Data Foundation Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. Organizations (future multi-tenant, single default for M1)
-- ============================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization');

-- ============================================================
-- 2. Customers (unified identity)
-- ============================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_org_id ON customers(org_id);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE UNIQUE INDEX idx_customers_org_email
  ON customers(org_id, email) WHERE email IS NOT NULL;

-- ============================================================
-- 3. Customer Sources (external ID linkage)
-- ============================================================
CREATE TYPE source_type AS ENUM ('stripe', 'calendly', 'passline', 'manual');

CREATE TABLE customer_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  source source_type NOT NULL,
  external_id TEXT NOT NULL,
  external_email TEXT,
  external_name TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_customer_sources_source_ext_id
  ON customer_sources(source, external_id);
CREATE INDEX idx_customer_sources_customer_id
  ON customer_sources(customer_id);
CREATE INDEX idx_customer_sources_external_email
  ON customer_sources(external_email);

-- ============================================================
-- 4. Import History
-- ============================================================
CREATE TYPE import_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE import_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES organizations(id) ON DELETE CASCADE,
  source source_type NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  status import_status NOT NULL DEFAULT 'pending',
  column_mapping JSONB,
  errors JSONB,
  imported_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_history_org_id ON import_history(org_id);
CREATE INDEX idx_import_history_source ON import_history(source);
CREATE INDEX idx_import_history_status ON import_history(status);

-- ============================================================
-- 5. Payments (Stripe data)
-- ============================================================
CREATE TYPE payment_status AS ENUM ('succeeded', 'pending', 'failed', 'refunded');

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  import_id UUID REFERENCES import_history(id) ON DELETE SET NULL,
  stripe_payment_id TEXT,
  stripe_customer_id TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status payment_status NOT NULL DEFAULT 'succeeded',
  payment_date TIMESTAMPTZ NOT NULL,
  description TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_payments_stripe_payment_id
  ON payments(stripe_payment_id) WHERE stripe_payment_id IS NOT NULL;
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_import_id ON payments(import_id);
CREATE INDEX idx_payments_org_id ON payments(org_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);

-- ============================================================
-- 6. Bookings (Calendly data)
-- ============================================================
CREATE TYPE booking_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  import_id UUID REFERENCES import_history(id) ON DELETE SET NULL,
  calendly_event_id TEXT,
  event_type TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status booking_status NOT NULL DEFAULT 'scheduled',
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_bookings_calendly_event_id
  ON bookings(calendly_event_id) WHERE calendly_event_id IS NOT NULL;
CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX idx_bookings_import_id ON bookings(import_id);
CREATE INDEX idx_bookings_org_id ON bookings(org_id);
CREATE INDEX idx_bookings_start_time ON bookings(start_time);

-- ============================================================
-- 7. Attendance (PassLine data)
-- ============================================================
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  import_id UUID REFERENCES import_history(id) ON DELETE SET NULL,
  passline_id TEXT,
  event_name TEXT,
  check_in_time TIMESTAMPTZ NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_attendance_passline_id
  ON attendance(passline_id) WHERE passline_id IS NOT NULL;
CREATE INDEX idx_attendance_customer_id ON attendance(customer_id);
CREATE INDEX idx_attendance_import_id ON attendance(import_id);
CREATE INDEX idx_attendance_org_id ON attendance(org_id);

-- ============================================================
-- 8. Saved Mappings (reusable column mappings per source)
-- ============================================================
CREATE TABLE saved_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES organizations(id) ON DELETE CASCADE,
  source source_type NOT NULL,
  name TEXT NOT NULL,
  mapping JSONB NOT NULL,
  sample_headers TEXT[],
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_mappings_org_source
  ON saved_mappings(org_id, source);

-- ============================================================
-- 9. Stitching Conflicts (flagged identity collisions)
-- ============================================================
CREATE TYPE conflict_status AS ENUM ('pending', 'merged', 'dismissed', 'split');

CREATE TABLE stitching_conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES organizations(id) ON DELETE CASCADE,
  customer_a_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_b_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  match_field TEXT NOT NULL,
  match_value TEXT,
  confidence NUMERIC(3, 2),
  status conflict_status NOT NULL DEFAULT 'pending',
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  import_id UUID REFERENCES import_history(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stitching_conflicts_status
  ON stitching_conflicts(status);
CREATE INDEX idx_stitching_conflicts_org_id
  ON stitching_conflicts(org_id);

-- ============================================================
-- 10. Updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_customers
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_saved_mappings
  BEFORE UPDATE ON saved_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 11. Row Level Security
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stitching_conflicts ENABLE ROW LEVEL SECURITY;

-- M1: Simple policies — authenticated users can access all data
-- (single org, single admin). Tighten for multi-tenant later.
CREATE POLICY "Authenticated read organizations"
  ON organizations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated full access customers"
  ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access customer_sources"
  ON customer_sources FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access import_history"
  ON import_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access payments"
  ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access bookings"
  ON bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access attendance"
  ON attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access saved_mappings"
  ON saved_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access stitching_conflicts"
  ON stitching_conflicts FOR ALL TO authenticated USING (true) WITH CHECK (true);
