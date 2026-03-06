-- 1. New source types
ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'crm';
ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'attribution';

-- 2. Add import provenance to customer_sources (enables per-import revert of identity links)
ALTER TABLE customer_sources ADD COLUMN IF NOT EXISTS import_id UUID
  REFERENCES import_history(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customer_sources_import ON customer_sources(import_id);

-- 3. CRM enrichment columns on customers (fill-null-only semantics)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visit_date DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS classes_remaining INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS membership_status TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS referral_source TEXT;

-- 4. CRM enrichment provenance table (enables view/download + revert)
CREATE TABLE IF NOT EXISTS crm_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  import_id UUID REFERENCES import_history(id) ON DELETE SET NULL,
  enriched_fields JSONB NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_enrichments_customer ON crm_enrichments(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_enrichments_import ON crm_enrichments(import_id);
ALTER TABLE crm_enrichments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access crm_enrichments"
  ON crm_enrichments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Attribution table
CREATE TABLE IF NOT EXISTS customer_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  import_id UUID REFERENCES import_history(id) ON DELETE SET NULL,
  first_touch_channel TEXT,
  referral_source TEXT,
  campaign TEXT,
  acquisition_date DATE,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attribution_customer ON customer_attribution(customer_id);
CREATE INDEX IF NOT EXISTS idx_attribution_import ON customer_attribution(import_id);
ALTER TABLE customer_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access customer_attribution"
  ON customer_attribution FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. FX rate cache (global, NOT org-scoped, NOT cleared by reset_demo_data)
CREATE TABLE IF NOT EXISTS fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date DATE NOT NULL,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'frankfurter',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rate_date, base_currency, quote_currency)
);
CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup
  ON fx_rates(base_currency, quote_currency, rate_date);

-- 7. Materialized FX conversion on payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_usd NUMERIC;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fx_rate NUMERIC;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fx_rate_date DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fx_source TEXT;

-- 8. CRM expansion columns on customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS skill_level TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS member_type TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS join_date DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_currency TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_time_slot TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS name_source TEXT;

-- 9. Attribution expansion: discriminator + shared + summary + touchpoint fields
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS attribution_type TEXT DEFAULT 'summary';
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS conversion_id TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS conversion_source TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS product TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS revenue_usd NUMERIC;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS conversion_date DATE;
-- Summary-specific (first-touch CSV, 19 cols)
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS n_touchpoints INTEGER;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS journey_span_days INTEGER;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS first_touch_utm_source TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS first_touch_utm_medium TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS first_touch_campaign TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS first_touch_referrer TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS first_touch_date DATE;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS last_touch_channel TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS last_touch_utm_source TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS last_touch_date DATE;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS attributed_revenue_usd NUMERIC;
-- Touchpoint-specific (journeys CSV, 20 cols)
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS touch_id TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS touch_number INTEGER;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS total_touches INTEGER;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS touch_position TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS touch_date DATE;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS days_before_conversion INTEGER;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS first_touch_credit NUMERIC;
ALTER TABLE customer_attribution ADD COLUMN IF NOT EXISTS first_touch_revenue NUMERIC;

-- 10. Transactional reset RPC (updated: includes stitching_conflicts, excludes fx_rates)
CREATE OR REPLACE FUNCTION reset_demo_data(target_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO deleted_count FROM import_history WHERE org_id = target_org_id;
  DELETE FROM attendance WHERE org_id = target_org_id;
  DELETE FROM bookings WHERE org_id = target_org_id;
  DELETE FROM payments WHERE org_id = target_org_id;
  DELETE FROM customer_attribution WHERE org_id = target_org_id;
  DELETE FROM crm_enrichments WHERE org_id = target_org_id;
  DELETE FROM stitching_conflicts WHERE org_id = target_org_id;
  DELETE FROM customers WHERE org_id = target_org_id;
  DELETE FROM import_history WHERE org_id = target_org_id;
  -- NOTE: fx_rates is NOT deleted — it is a global cache shared across tenants
  RETURN deleted_count;
END;
$$;
