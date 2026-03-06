-- Migration: revert_import_data + delete_import_data RPC functions
-- Replaces slow N+1 orphan detection loops with single-transaction SQL

-- Index for stitching_conflicts lookups by import_id
CREATE INDEX IF NOT EXISTS idx_stitching_conflicts_import ON stitching_conflicts(import_id);

-- ─── revert_import_data ─────────────────────────────────────────────
-- Reverts a completed import: deletes all provenance rows, cleans up
-- orphaned customers, and marks import as "reverted".

CREATE OR REPLACE FUNCTION revert_import_data(target_import_id UUID, target_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  imp RECORD;
  del_payments    INT := 0;
  del_bookings    INT := 0;
  del_attendance  INT := 0;
  del_crm         INT := 0;
  del_attribution INT := 0;
  del_sources     INT := 0;
  del_conflicts   INT := 0;
  del_customers   INT := 0;
BEGIN
  -- 1. Fetch and validate import
  SELECT id, status, org_id INTO imp
  FROM import_history
  WHERE id = target_import_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import not found';
  END IF;

  IF imp.org_id != target_org_id THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF imp.status = 'processing' THEN
    RAISE EXCEPTION 'Import still processing';
  END IF;

  IF imp.status = 'reverted' THEN
    RAISE EXCEPTION 'Import already reverted';
  END IF;

  -- 2. Collect affected customer IDs into a temp table
  CREATE TEMP TABLE _affected_customers ON COMMIT DROP AS
  SELECT DISTINCT customer_id FROM (
    SELECT customer_id FROM payments WHERE import_id = target_import_id
    UNION
    SELECT customer_id FROM bookings WHERE import_id = target_import_id
    UNION
    SELECT customer_id FROM attendance WHERE import_id = target_import_id
    UNION
    SELECT customer_id FROM crm_enrichments WHERE import_id = target_import_id
    UNION
    SELECT customer_id FROM customer_attribution WHERE import_id = target_import_id
    UNION
    SELECT customer_id FROM customer_sources WHERE import_id = target_import_id
  ) sub;

  -- 3. Bulk-delete provenance rows
  DELETE FROM payments WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_payments = ROW_COUNT;

  DELETE FROM bookings WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_bookings = ROW_COUNT;

  DELETE FROM attendance WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_attendance = ROW_COUNT;

  DELETE FROM crm_enrichments WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_crm = ROW_COUNT;

  DELETE FROM customer_attribution WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_attribution = ROW_COUNT;

  DELETE FROM customer_sources WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_sources = ROW_COUNT;

  DELETE FROM stitching_conflicts WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_conflicts = ROW_COUNT;

  -- 4. Delete orphaned customers (no remaining records in any table)
  DELETE FROM stitching_conflicts sc
  USING _affected_customers ac
  WHERE (sc.customer_a_id = ac.customer_id OR sc.customer_b_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM crm_enrichments ce WHERE ce.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM customer_attribution ca WHERE ca.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM customer_sources cs WHERE cs.customer_id = ac.customer_id);

  DELETE FROM customers c
  USING _affected_customers ac
  WHERE c.id = ac.customer_id
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM crm_enrichments ce WHERE ce.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM customer_attribution ca WHERE ca.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM customer_sources cs WHERE cs.customer_id = ac.customer_id);
  GET DIAGNOSTICS del_customers = ROW_COUNT;

  -- 5. Mark import as reverted
  UPDATE import_history
  SET status = 'reverted', completed_at = NOW()
  WHERE id = target_import_id;

  RETURN jsonb_build_object(
    'deleted_payments', del_payments,
    'deleted_bookings', del_bookings,
    'deleted_attendance', del_attendance,
    'deleted_crm', del_crm,
    'deleted_attribution', del_attribution,
    'deleted_sources', del_sources,
    'deleted_conflicts', del_conflicts,
    'deleted_customers', del_customers
  );
END;
$$;

-- ─── delete_import_data ─────────────────────────────────────────────
-- Same as revert, but hard-deletes the import_history row.
-- Accepts already-reverted imports (they can still be deleted).

CREATE OR REPLACE FUNCTION delete_import_data(target_import_id UUID, target_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  imp RECORD;
  del_payments    INT := 0;
  del_bookings    INT := 0;
  del_attendance  INT := 0;
  del_crm         INT := 0;
  del_attribution INT := 0;
  del_sources     INT := 0;
  del_conflicts   INT := 0;
  del_customers   INT := 0;
BEGIN
  -- 1. Fetch and validate import
  SELECT id, status, org_id INTO imp
  FROM import_history
  WHERE id = target_import_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import not found';
  END IF;

  IF imp.org_id != target_org_id THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF imp.status = 'processing' THEN
    RAISE EXCEPTION 'Import still processing';
  END IF;

  -- 2. Collect affected customer IDs into a temp table
  CREATE TEMP TABLE _affected_customers ON COMMIT DROP AS
  SELECT DISTINCT customer_id FROM (
    SELECT customer_id FROM payments WHERE import_id = target_import_id
    UNION
    SELECT customer_id FROM bookings WHERE import_id = target_import_id
    UNION
    SELECT customer_id FROM attendance WHERE import_id = target_import_id
    UNION
    SELECT customer_id FROM crm_enrichments WHERE import_id = target_import_id
    UNION
    SELECT customer_id FROM customer_attribution WHERE import_id = target_import_id
    UNION
    SELECT customer_id FROM customer_sources WHERE import_id = target_import_id
  ) sub;

  -- 3. Bulk-delete provenance rows
  DELETE FROM payments WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_payments = ROW_COUNT;

  DELETE FROM bookings WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_bookings = ROW_COUNT;

  DELETE FROM attendance WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_attendance = ROW_COUNT;

  DELETE FROM crm_enrichments WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_crm = ROW_COUNT;

  DELETE FROM customer_attribution WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_attribution = ROW_COUNT;

  DELETE FROM customer_sources WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_sources = ROW_COUNT;

  DELETE FROM stitching_conflicts WHERE import_id = target_import_id;
  GET DIAGNOSTICS del_conflicts = ROW_COUNT;

  -- 4. Delete orphaned customers
  DELETE FROM stitching_conflicts sc
  USING _affected_customers ac
  WHERE (sc.customer_a_id = ac.customer_id OR sc.customer_b_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM crm_enrichments ce WHERE ce.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM customer_attribution ca WHERE ca.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM customer_sources cs WHERE cs.customer_id = ac.customer_id);

  DELETE FROM customers c
  USING _affected_customers ac
  WHERE c.id = ac.customer_id
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM crm_enrichments ce WHERE ce.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM customer_attribution ca WHERE ca.customer_id = ac.customer_id)
    AND NOT EXISTS (SELECT 1 FROM customer_sources cs WHERE cs.customer_id = ac.customer_id);
  GET DIAGNOSTICS del_customers = ROW_COUNT;

  -- 5. Hard-delete the import_history row
  DELETE FROM import_history WHERE id = target_import_id;

  RETURN jsonb_build_object(
    'deleted_payments', del_payments,
    'deleted_bookings', del_bookings,
    'deleted_attendance', del_attendance,
    'deleted_crm', del_crm,
    'deleted_attribution', del_attribution,
    'deleted_sources', del_sources,
    'deleted_conflicts', del_conflicts,
    'deleted_customers', del_customers
  );
END;
$$;
