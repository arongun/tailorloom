-- Migration: insight_config_phase1
-- Adds profile-driven config columns and UNIQUE constraint for upsert safety.

-- Safety: deterministic dedupe before adding UNIQUE constraint
-- Keeps one row per org_id (most recent by updated_at, then by id as tiebreaker)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY updated_at DESC, id DESC) AS rn
  FROM insight_config
)
DELETE FROM insight_config WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Add UNIQUE constraint on org_id (required for existing upsert onConflict: "org_id")
ALTER TABLE insight_config ADD CONSTRAINT insight_config_org_id_key UNIQUE (org_id);

-- New nullable columns — NULL = use profile default
ALTER TABLE insight_config ADD COLUMN IF NOT EXISTS at_risk_days INTEGER;
ALTER TABLE insight_config ADD COLUMN IF NOT EXISTS dormant_days INTEGER;
ALTER TABLE insight_config ADD COLUMN IF NOT EXISTS lost_days INTEGER;
ALTER TABLE insight_config ADD COLUMN IF NOT EXISTS repeat_purchase_min INTEGER;
ALTER TABLE insight_config ADD COLUMN IF NOT EXISTS active_profile TEXT;

-- Rollback:
-- ALTER TABLE insight_config DROP CONSTRAINT IF EXISTS insight_config_org_id_key;
-- ALTER TABLE insight_config DROP COLUMN IF EXISTS at_risk_days;
-- ALTER TABLE insight_config DROP COLUMN IF EXISTS dormant_days;
-- ALTER TABLE insight_config DROP COLUMN IF EXISTS lost_days;
-- ALTER TABLE insight_config DROP COLUMN IF EXISTS repeat_purchase_min;
-- ALTER TABLE insight_config DROP COLUMN IF EXISTS active_profile;
