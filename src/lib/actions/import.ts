"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCSVContent } from "@/lib/csv/parser";
import {
  generateMappingSuggestions,
  suggestionsToMapping,
} from "@/lib/csv/heuristic-mapper";
import { validateMappedRow, applyMapping, parseCurrency, parseTimestamp } from "@/lib/csv/validators";
import { normalizeStatus } from "@/lib/csv/normalizers";
import { getSchema, schemaKeyToSourceType, detectAttributionSubtype } from "@/lib/csv/schemas";
import {
  stitchIdentity,
  detectPostImportConflicts,
  previewStitchIdentity,
  checkDuplicateRow,
  matchCRMCustomer,
  matchAttributionCustomer,
  shouldUpdateName,
} from "@/lib/stitching/matcher";
import { normalizePhone, phonesMatch } from "@/lib/stitching/phone-utils";
import { resolveRates, toUSD } from "@/lib/fx";
import type {
  SourceType,
  SchemaKey,
  ImportResultDetailed,
  PreviewResult,
  ValidationError,
  MappingSuggestion,
  StitchPreviewResult,
  StitchPreviewRow,
  StitchDecisions,
} from "@/lib/types";
import { findMatchingSavedMapping } from "./mappings";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

interface UploadOptions {
  source: SourceType;
  schemaKey?: SchemaKey;
  fileName: string;
  content: string;
  mapping?: Record<string, string>;
  stitchDecisions?: StitchDecisions;
}

interface PreviewOptions {
  source: SourceType;
  content: string;
  mapping?: Record<string, string>;
}

/**
 * Preview CSV import: parse, map, validate without writing to DB.
 */
export async function previewCSV(options: PreviewOptions): Promise<{
  preview: PreviewResult;
  suggestions: MappingSuggestion[];
  headers: string[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const schema = getSchema(options.source);
  if (!schema) throw new Error(`Unknown source: ${options.source}`);

  // Parse CSV
  const parsed = parseCSVContent(options.content);

  // Get mapping — either provided, from saved mappings, or auto-generated
  let mapping = options.mapping;
  let suggestions: MappingSuggestion[] = [];

  if (!mapping) {
    // Try saved mapping first
    const admin = createAdminClient();
    const savedMapping = await findMatchingSavedMapping(
      admin,
      options.source,
      parsed.headers
    );

    if (savedMapping) {
      mapping = savedMapping.mapping;
    } else {
      // Auto-generate
      suggestions = generateMappingSuggestions(
        parsed.headers,
        schema,
        parsed.sampleRows
      );
      mapping = suggestionsToMapping(suggestions);
    }
  } else {
    // Generate suggestions for display even when mapping is provided
    suggestions = generateMappingSuggestions(
      parsed.headers,
      schema,
      parsed.sampleRows
    );
  }

  // Map and validate all rows
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];
  const mappedRows: Record<string, string | null>[] = [];
  let validCount = 0;
  let errorCount = 0;

  // Only preview first 10 rows for display
  const previewLimit = 10;

  for (let i = 0; i < parsed.rows.length; i++) {
    const mapped = applyMapping(parsed.rows[i], mapping);
    // Normalize status field before validation
    if (mapped.status) {
      mapped.status = normalizeStatus(mapped.status, options.source);
    }
    const { errors: rowErrors, warnings: rowWarnings } = validateMappedRow(mapped, schema, i + 1);

    if (rowWarnings.length > 0) {
      allWarnings.push(...rowWarnings);
    }

    if (rowErrors.length > 0) {
      allErrors.push(...rowErrors);
      errorCount++;
    } else {
      validCount++;
    }

    if (i < previewLimit) {
      mappedRows.push(mapped);
    }
  }

  return {
    preview: {
      mappedRows,
      validationErrors: [...allErrors.slice(0, 50), ...allWarnings.slice(0, 50)],
      totalRows: parsed.totalRows,
      validRows: validCount,
      errorRows: errorCount,
    },
    suggestions,
    headers: parsed.headers,
  };
}

/**
 * Preview stitching: parse, map, validate, then run read-only stitch preview
 * on all valid rows to show match breakdown without writing to DB.
 */
export async function previewStitching(options: {
  source: SourceType;
  content: string;
  mapping: Record<string, string>;
}): Promise<StitchPreviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const schema = getSchema(options.source);
  if (!schema) throw new Error(`Unknown source: ${options.source}`);

  const parsed = parseCSVContent(options.content);

  const uncertainRows: StitchPreviewRow[] = [];
  const nameReviewRows: StitchPreviewRow[] = [];
  const confidentRows: StitchPreviewRow[] = [];
  const newRows: StitchPreviewRow[] = [];
  const duplicateRows: StitchPreviewRow[] = [];
  const enrichmentRows: StitchPreviewRow[] = [];
  const allWarnings: ValidationError[] = [];

  let confidentCount = 0;
  let uncertainCount = 0;
  let nameReviewCount = 0;
  let newCount = 0;
  let duplicateCount = 0;
  let enrichmentCount = 0;
  let totalValid = 0;

  for (let i = 0; i < parsed.rows.length; i++) {
    const rawRow = parsed.rows[i];
    const mapped = applyMapping(rawRow, options.mapping);
    if (mapped.status) {
      mapped.status = normalizeStatus(mapped.status, options.source);
    }
    const { errors: rowErrors, warnings: rowWarnings } = validateMappedRow(mapped, schema, i + 1);
    if (rowWarnings.length > 0) {
      allWarnings.push(...rowWarnings);
    }
    if (rowErrors.length > 0) continue;

    totalValid++;

    const externalId = mapped[schema.idField] ?? "";
    const email = mapped[schema.emailField] ?? null;
    const name = schema.nameField ? (mapped[schema.nameField] ?? null) : null;
    const phone = schema.phoneField ? (mapped[schema.phoneField] ?? null) : null;

    // Use customerIdField (e.g. membership_id for POS, stripe customer ID) as stitch key
    const stitchExternalId =
      schema.customerIdField
        ? (mapped[schema.customerIdField] ?? externalId)
        : externalId;

    // Check duplicate first
    if (externalId) {
      const isDuplicate = await checkDuplicateRow(admin, options.source, externalId);
      if (isDuplicate) {
        duplicateCount++;
        if (duplicateRows.length < 20) {
          duplicateRows.push({
            rowIndex: i + 1,
            externalId,
            email,
            name,
            phone,
            category: "duplicate",
            existingCustomerId: null,
            existingCustomerName: null,
            existingCustomerEmail: null,
            confidence: 1,
            candidates: [],
            enrichableFields: [],
          });
        }
        continue;
      }
    }

    // Preview stitch
    const preview = await previewStitchIdentity(admin, options.source, stitchExternalId, email, name, phone);

    const row: StitchPreviewRow = {
      rowIndex: i + 1,
      externalId,
      email,
      name,
      phone,
      category: preview.category,
      existingCustomerId: preview.existingCustomerId,
      existingCustomerName: preview.existingCustomerName,
      existingCustomerEmail: preview.existingCustomerEmail,
      confidence: preview.confidence,
      candidates: preview.candidates,
      enrichableFields: preview.enrichableFields,
      rawRow,
    };

    switch (preview.category) {
      case "external_id":
      case "email":
        confidentCount++;
        if (confidentRows.length < 50) confidentRows.push(row);
        break;
      case "email_name_mismatch":
        nameReviewCount++;
        nameReviewRows.push(row);
        break;
      case "enrichment":
        enrichmentCount++;
        enrichmentRows.push(row);
        break;
      case "phone":
      case "name_match":
      case "name_conflict":
        uncertainCount++;
        uncertainRows.push(row);
        break;
      case "new":
        newCount++;
        if (newRows.length < 50) newRows.push(row);
        break;
    }
  }

  return {
    summary: {
      confidentMatches: confidentCount,
      uncertainMatches: uncertainCount,
      nameReviewMatches: nameReviewCount,
      newCustomers: newCount,
      duplicateRows: duplicateCount,
      enrichments: enrichmentCount,
      totalValidRows: totalValid,
    },
    uncertainRows,
    nameReviewRows,
    confidentRows,
    newRows,
    duplicateRows,
    enrichmentRows,
    warnings: allWarnings.slice(0, 50),
  };
}

/**
 * Preview CRM stitching: read-only lookup per row to count matches vs new.
 * Returns summary counts only (no row arrays) for multi-file batch preview.
 */
export async function previewCRMStitching(options: {
  content: string;
  mapping: Record<string, string>;
}): Promise<StitchPreviewResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const schema = getSchema("crm");
  if (!schema) throw new Error("Unknown source: crm");

  const parsed = parseCSVContent(options.content);

  let confidentCount = 0;
  let newCount = 0;
  let totalValid = 0;
  let errorCount = 0;

  for (let i = 0; i < parsed.rows.length; i++) {
    const rawRow = parsed.rows[i];
    const mapped = applyMapping(rawRow, options.mapping);
    const { errors: rowErrors } = validateMappedRow(mapped, schema, i + 1);
    if (rowErrors.length > 0) { errorCount++; continue; }

    const email = mapped.email ?? null;
    const phone = mapped.phone ?? null;
    const memberId = mapped.member_id ?? null;

    // Identifier guardrail — matches import-time check
    if (!email && !phone && !memberId) { errorCount++; continue; }

    totalValid++;

    // Email lookup
    if (email) {
      const { data } = await admin
        .from("customers")
        .select("id")
        .eq("org_id", "00000000-0000-0000-0000-000000000001")
        .eq("email", email)
        .maybeSingle();
      if (data) { confidentCount++; continue; }
    }

    // Phone lookup
    if (phone) {
      const normalized = normalizePhone(phone);
      if (normalized) {
        const { data: phoneCustomers } = await admin
          .from("customers")
          .select("id, phone")
          .eq("org_id", "00000000-0000-0000-0000-000000000001")
          .not("phone", "is", null);
        if (phoneCustomers) {
          const matches = phoneCustomers.filter((c) => phonesMatch(c.phone, phone));
          if (matches.length === 1) { confidentCount++; continue; }
        }
      }
    }

    // Member ID lookup (POS source)
    if (memberId) {
      const { data } = await admin
        .from("customer_sources")
        .select("customer_id")
        .eq("source", "pos")
        .eq("external_id", memberId)
        .maybeSingle();
      if (data) { confidentCount++; continue; }
    }

    newCount++;
  }

  return {
    summary: {
      confidentMatches: confidentCount,
      uncertainMatches: 0,
      nameReviewMatches: 0,
      newCustomers: newCount,
      duplicateRows: 0,
      enrichments: 0,
      totalValidRows: totalValid,
    },
    uncertainRows: [],
    nameReviewRows: [],
    confidentRows: [],
    newRows: [],
    duplicateRows: [],
    enrichmentRows: [],
    warnings: [],
  };
}

/**
 * Preview Attribution stitching: read-only lookup per row to count matches vs new.
 * Returns summary counts only (no row arrays) for multi-file batch preview.
 */
export async function previewAttributionStitching(options: {
  content: string;
  mapping: Record<string, string>;
}): Promise<StitchPreviewResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const schema = getSchema("attribution");
  if (!schema) throw new Error("Unknown source: attribution");

  const parsed = parseCSVContent(options.content);

  let confidentCount = 0;
  let newCount = 0;
  let totalValid = 0;
  let errorCount = 0;

  for (let i = 0; i < parsed.rows.length; i++) {
    const rawRow = parsed.rows[i];
    const mapped = applyMapping(rawRow, options.mapping);
    const { errors: rowErrors } = validateMappedRow(mapped, schema, i + 1);
    if (rowErrors.length > 0) { errorCount++; continue; }

    const email = mapped.email ?? null;
    const phone = mapped.phone ?? null;

    // Identifier guardrail — matches import-time check
    if (!email && !phone) { errorCount++; continue; }

    totalValid++;

    // Email lookup
    if (email) {
      const { data } = await admin
        .from("customers")
        .select("id")
        .eq("org_id", "00000000-0000-0000-0000-000000000001")
        .eq("email", email)
        .maybeSingle();
      if (data) { confidentCount++; continue; }
    }

    // Phone lookup
    if (phone) {
      const normalized = normalizePhone(phone);
      if (normalized) {
        const { data: phoneCustomers } = await admin
          .from("customers")
          .select("id, phone")
          .eq("org_id", "00000000-0000-0000-0000-000000000001")
          .not("phone", "is", null);
        if (phoneCustomers) {
          const matches = phoneCustomers.filter((c) => phonesMatch(c.phone, phone));
          if (matches.length === 1) { confidentCount++; continue; }
        }
      }
    }

    newCount++;
  }

  return {
    summary: {
      confidentMatches: confidentCount,
      uncertainMatches: 0,
      nameReviewMatches: 0,
      newCustomers: newCount,
      duplicateRows: 0,
      enrichments: 0,
      totalValidRows: totalValid,
    },
    uncertainRows: [],
    nameReviewRows: [],
    confidentRows: [],
    newRows: [],
    duplicateRows: [],
    enrichmentRows: [],
    warnings: [],
  };
}

/**
 * Full CSV import: parse, map, validate, stitch identities, write to DB.
 */
export async function uploadCSV(options: UploadOptions): Promise<ImportResultDetailed> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const schema = getSchema(options.source);
  if (!schema) throw new Error(`Unknown source: ${options.source}`);

  // Parse CSV
  const parsed = parseCSVContent(options.content);

  // Get mapping
  let mapping = options.mapping;
  if (!mapping) {
    const savedMapping = await findMatchingSavedMapping(
      admin,
      options.source,
      parsed.headers
    );
    if (savedMapping) {
      mapping = savedMapping.mapping;
    } else {
      const suggestions = generateMappingSuggestions(
        parsed.headers,
        schema,
        parsed.sampleRows
      );
      mapping = suggestionsToMapping(suggestions);
    }
  }

  // Create import_history record
  const { data: importRecord, error: importError } = await admin
    .from("import_history")
    .insert({
      source: options.source,
      file_name: options.fileName,
      file_size_bytes: new Blob([options.content]).size,
      total_rows: parsed.totalRows,
      status: "processing",
      column_mapping: mapping,
      imported_by: user.id,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (importError)
    throw new Error(`Failed to create import record: ${importError.message}`);

  const importId = importRecord.id;
  let importedRows = 0;
  let skippedRows = 0;
  let errorRows = 0;
  const errors: ValidationError[] = [];

  // Detailed counters
  let matchedByExternalId = 0;
  let matchedByEmail = 0;
  let matchedByPhone = 0;
  let newCustomersCreated = 0;
  let duplicateRowsSkipped = 0;
  let userSkippedRows = 0;
  let conflictsCreated = 0;
  let enrichedCount = 0;

  const decisions = options.stitchDecisions ?? {};

  // ─── CRM import path ────────────────────────────────────
  if (options.source === "crm") {
    for (let i = 0; i < parsed.rows.length; i++) {
      const rawRow = parsed.rows[i];
      const mapped = applyMapping(rawRow, mapping);
      const { errors: rowErrors, warnings: rowWarnings } = validateMappedRow(mapped, schema, i + 1);
      if (rowWarnings.length > 0) errors.push(...rowWarnings.map((w) => ({ ...w, severity: "warning" as const })));
      if (rowErrors.length > 0) { errors.push(...rowErrors); errorRows++; continue; }

      const email = mapped.email ?? null;
      const phone = mapped.phone ?? null;
      const memberId = mapped.member_id ?? null;
      const name = mapped.full_name ?? null;

      // Row-level identifier check
      if (!email && !phone && !memberId) {
        errors.push({ row: i + 1, field: "", message: "No usable identifier (need email, phone, or member_id)" });
        errorRows++;
        continue;
      }

      try {
        const { customerId, isNew } = await matchCRMCustomer(admin, email, phone, memberId, name);
        if (isNew) newCustomersCreated++;
        else matchedByEmail++;

        // Build enrichment fields (fill-null-only)
        const enrichedFields: Record<string, string | number> = {};
        const updates: Record<string, unknown> = {};

        // Fetch current customer to check null fields
        const { data: current } = await admin
          .from("customers")
          .select("full_name, email, phone, last_visit_date, classes_remaining, membership_status, referral_source, country, notes, occupation, skill_level, member_type, join_date, preferred_currency, preferred_time_slot, name_source")
          .eq("id", customerId)
          .single();

        if (current) {
          // CRM has highest name priority — always overwrite name if different
          if (name && (!current.full_name || current.full_name !== name)) {
            updates.full_name = name; updates.name_source = "crm"; enrichedFields.full_name = name;
          }
          if (!current.email && email) { updates.email = email; enrichedFields.email = email; }
          if (!current.phone && phone) { updates.phone = phone; enrichedFields.phone = phone; }
          if (!current.last_visit_date && mapped.last_visit_date) { updates.last_visit_date = mapped.last_visit_date; enrichedFields.last_visit_date = mapped.last_visit_date; }
          if (current.classes_remaining == null && mapped.classes_remaining) {
            const val = parseInt(mapped.classes_remaining, 10);
            if (!isNaN(val)) { updates.classes_remaining = val; enrichedFields.classes_remaining = val; }
          }
          if (!current.membership_status && mapped.membership_status) { updates.membership_status = mapped.membership_status; enrichedFields.membership_status = mapped.membership_status; }
          if (!current.referral_source && mapped.referral_source) { updates.referral_source = mapped.referral_source; enrichedFields.referral_source = mapped.referral_source; }
          if (!current.country && mapped.country) { updates.country = mapped.country; enrichedFields.country = mapped.country; }
          if (!current.notes && mapped.notes) { updates.notes = mapped.notes; enrichedFields.notes = mapped.notes; }
          if (!current.occupation && mapped.occupation) { updates.occupation = mapped.occupation; enrichedFields.occupation = mapped.occupation; }
          if (!current.skill_level && mapped.skill_level) { updates.skill_level = mapped.skill_level; enrichedFields.skill_level = mapped.skill_level; }
          if (!current.member_type && mapped.member_type) { updates.member_type = mapped.member_type; enrichedFields.member_type = mapped.member_type; }
          if (!current.join_date && mapped.join_date) { updates.join_date = mapped.join_date; enrichedFields.join_date = mapped.join_date; }
          if (!current.preferred_currency && mapped.preferred_currency) { updates.preferred_currency = mapped.preferred_currency; enrichedFields.preferred_currency = mapped.preferred_currency; }
          if (!current.preferred_time_slot && mapped.preferred_time_slot) { updates.preferred_time_slot = mapped.preferred_time_slot; enrichedFields.preferred_time_slot = mapped.preferred_time_slot; }

          if (Object.keys(updates).length > 0) {
            await admin.from("customers").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", customerId);
            enrichedCount++;
          }
        }

        // Insert CRM enrichment provenance record
        await admin.from("crm_enrichments").insert({
          org_id: DEFAULT_ORG_ID,
          customer_id: customerId,
          import_id: importId,
          enriched_fields: enrichedFields,
          raw_data: rawRow,
        });

        importedRows++;
      } catch (err) {
        errors.push({ row: i + 1, field: "", message: err instanceof Error ? err.message : "Unknown error" });
        errorRows++;
      }
    }
  }
  // ─── Attribution import path ─────────────────────────────
  else if (options.source === "attribution") {
    // Determine attribution sub-type
    const resolvedSchemaKey = options.schemaKey ?? detectAttributionSubtype(parsed.headers);
    const attrSchema = getSchema(resolvedSchemaKey) ?? schema;
    const isJourneys = resolvedSchemaKey === "attribution_journeys";
    const attributionType = isJourneys ? "touchpoint" : "summary";

    for (let i = 0; i < parsed.rows.length; i++) {
      const rawRow = parsed.rows[i];
      const mapped = applyMapping(rawRow, mapping);
      const { errors: rowErrors, warnings: rowWarnings } = validateMappedRow(mapped, attrSchema, i + 1);
      if (rowWarnings.length > 0) errors.push(...rowWarnings.map((w) => ({ ...w, severity: "warning" as const })));
      if (rowErrors.length > 0) { errors.push(...rowErrors); errorRows++; continue; }

      const email = mapped.email ?? null;
      const phone = mapped.phone ?? null;
      const name = mapped.full_name ?? null;

      // Row-level identifier check
      if (!email && !phone) {
        errors.push({ row: i + 1, field: "", message: "No usable identifier (need email or phone)" });
        errorRows++;
        continue;
      }

      try {
        const { customerId, isNew } = await matchAttributionCustomer(admin, email, phone, name);
        if (isNew) newCustomersCreated++;
        else matchedByEmail++;

        // Build insert record with all fields based on attribution type
        const insertRecord: Record<string, unknown> = {
          org_id: DEFAULT_ORG_ID,
          customer_id: customerId,
          import_id: importId,
          attribution_type: attributionType,
          conversion_id: mapped.conversion_id ?? null,
          conversion_source: mapped.conversion_source ?? null,
          full_name: name,
          product: mapped.product ?? null,
          revenue_usd: mapped.revenue_usd ? (parseCurrency(mapped.revenue_usd) ?? null) : null,
          conversion_date: mapped.conversion_date ?? null,
          first_touch_channel: mapped.first_touch_channel ?? null,
          referral_source: mapped.referral_source ?? null,
          campaign: mapped.campaign ?? mapped.first_touch_campaign ?? null,
          acquisition_date: mapped.acquisition_date ?? mapped.conversion_date ?? null,
          raw_data: rawRow,
        };

        if (isJourneys) {
          // Touchpoint-specific fields
          insertRecord.touch_id = mapped.touch_id ?? null;
          insertRecord.touch_number = mapped.touch_number ? parseInt(mapped.touch_number, 10) || null : null;
          insertRecord.total_touches = mapped.total_touches ? parseInt(mapped.total_touches, 10) || null : null;
          insertRecord.touch_position = mapped.touch_position ?? null;
          insertRecord.channel = mapped.channel ?? null;
          insertRecord.utm_source = mapped.utm_source ?? null;
          insertRecord.utm_medium = mapped.utm_medium ?? null;
          insertRecord.utm_campaign = mapped.utm_campaign ?? null;
          insertRecord.referrer = mapped.referrer ?? null;
          insertRecord.touch_date = mapped.touch_date ?? null;
          insertRecord.days_before_conversion = mapped.days_before_conversion ? parseInt(mapped.days_before_conversion, 10) || null : null;
          insertRecord.first_touch_credit = mapped.first_touch_credit ? (parseCurrency(mapped.first_touch_credit) ?? null) : null;
          insertRecord.first_touch_revenue = mapped.first_touch_revenue ? (parseCurrency(mapped.first_touch_revenue) ?? null) : null;
        } else {
          // Summary-specific fields
          insertRecord.n_touchpoints = mapped.n_touchpoints ? parseInt(mapped.n_touchpoints, 10) || null : null;
          insertRecord.journey_span_days = mapped.journey_span_days ? parseInt(mapped.journey_span_days, 10) || null : null;
          insertRecord.first_touch_utm_source = mapped.first_touch_utm_source ?? null;
          insertRecord.first_touch_utm_medium = mapped.first_touch_utm_medium ?? null;
          insertRecord.first_touch_campaign = mapped.first_touch_campaign ?? null;
          insertRecord.first_touch_referrer = mapped.first_touch_referrer ?? null;
          insertRecord.first_touch_date = mapped.first_touch_date ?? null;
          insertRecord.last_touch_channel = mapped.last_touch_channel ?? null;
          insertRecord.last_touch_utm_source = mapped.last_touch_utm_source ?? null;
          insertRecord.last_touch_date = mapped.last_touch_date ?? null;
          insertRecord.attributed_revenue_usd = mapped.attributed_revenue_usd ? (parseCurrency(mapped.attributed_revenue_usd) ?? null) : null;
        }

        await admin.from("customer_attribution").insert(insertRecord);

        importedRows++;
      } catch (err) {
        errors.push({ row: i + 1, field: "", message: err instanceof Error ? err.message : "Unknown error" });
        errorRows++;
      }
    }
  }
  // ─── Transaction import path (existing) ──────────────────
  else {
  // Pre-resolve FX rates for all rows in batch
  const fxPairs: { currency: string; date: string }[] = [];
  for (const rawRow of parsed.rows) {
    const mapped = applyMapping(rawRow, mapping);
    const cur = (mapped.currency ?? "USD").toUpperCase().trim() || "USD";
    const dateStr = mapped.payment_date ?? mapped.booking_date ?? "";
    const parsedDate = parseTimestamp(dateStr);
    const dateOnly = parsedDate ? parsedDate.split("T")[0] : new Date().toISOString().split("T")[0];
    if (cur !== "USD") {
      fxPairs.push({ currency: cur, date: dateOnly });
    }
  }
  const rateMap = fxPairs.length > 0 ? await resolveRates(admin, fxPairs) : new Map<string, number>();

  for (let i = 0; i < parsed.rows.length; i++) {
    const rawRow = parsed.rows[i];
    const mapped = applyMapping(rawRow, mapping);
    if (mapped.status) {
      mapped.status = normalizeStatus(mapped.status, options.source);
    }
    const { errors: rowErrors, warnings: rowWarnings } = validateMappedRow(mapped, schema, i + 1);

    // Collect warnings (stripped emails etc.) — row still imports
    if (rowWarnings.length > 0) {
      errors.push(...rowWarnings.map((w) => ({ ...w, severity: "warning" as const })));
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      errorRows++;
      continue;
    }

    try {
      const externalId = mapped[schema.idField] ?? "";
      const email = mapped[schema.emailField] ?? null;
      const name = schema.nameField ? (mapped[schema.nameField] ?? null) : null;
      const phone = schema.phoneField ? (mapped[schema.phoneField] ?? null) : null;

      // Use customerIdField (e.g. membership_id for POS, stripe customer ID) as stitch key
      const stitchExternalId =
        schema.customerIdField
          ? (mapped[schema.customerIdField] ?? externalId)
          : externalId;

      // Check for user skip decision
      const decision = decisions[i + 1]; // decisions are keyed by 1-based row index
      if (decision && decision.action === "skip") {
        userSkippedRows++;
        skippedRows++;
        continue;
      }

      // Determine forceCustomerId and enrichFields from user decisions
      let forceId: string | undefined;
      let enrichFields: { full_name?: string; email?: string; phone?: string } | undefined;
      let forceNameUpdate: string | undefined;

      if (decision) {
        if (decision.action === "merge") {
          forceId = decision.targetCustomerId;
        } else if (decision.action === "merge_keep_name") {
          forceId = decision.targetCustomerId;
        } else if (decision.action === "merge_update_name") {
          forceId = decision.targetCustomerId;
          if (name) forceNameUpdate = name;
        } else if (decision.action === "accept_enrichment") {
          forceId = decision.targetCustomerId;
          // Build enrichment fields from the CSV row data
          enrichFields = {};
          if (name) enrichFields.full_name = name;
          if (email) enrichFields.email = email;
          if (phone) enrichFields.phone = phone;
          enrichedCount++;
        }
      }

      // Stitch identity
      const { customerId, isNew, matchedBy } = await stitchIdentity(
        admin,
        options.source,
        stitchExternalId,
        email,
        name,
        phone,
        forceId,
        enrichFields,
        forceNameUpdate,
        importId
      );

      // Track match type
      if (forceId && !enrichFields) {
        matchedByEmail++; // User-forced merges count as manual match
      } else if (matchedBy === "external_id") {
        matchedByExternalId++;
      } else if (matchedBy === "email") {
        matchedByEmail++;
      } else if (matchedBy === "phone") {
        matchedByPhone++;
      } else if (isNew && matchedBy === "name") {
        newCustomersCreated++;
        conflictsCreated++;
      } else if (isNew) {
        newCustomersCreated++;
      }

      // Insert into source-specific table (with FX conversion)
      const inserted = await insertSourceRow(
        admin,
        options.source,
        mapped,
        customerId,
        importId,
        rawRow,
        rateMap
      );

      if (inserted) {
        importedRows++;
      } else {
        duplicateRowsSkipped++;
        skippedRows++;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      errors.push({
        row: i + 1,
        field: "",
        message,
      });
      errorRows++;
    }
  }
  } // end transaction path

  // Update import record
  const finalStatus =
    errorRows === parsed.totalRows
      ? "failed"
      : importedRows === 0
        ? "skipped"
        : "completed";

  await admin
    .from("import_history")
    .update({
      imported_rows: importedRows,
      skipped_rows: skippedRows,
      error_rows: errorRows,
      status: finalStatus,
      errors: errors.length > 0 ? errors.slice(0, 100) : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importId);

  // Post-import conflict detection
  const postConflicts = await detectPostImportConflicts(admin, importId);
  conflictsCreated += postConflicts;

  return {
    importId,
    totalRows: parsed.totalRows,
    importedRows,
    skippedRows,
    errorRows,
    errors,
    matchedByExternalId,
    matchedByEmail,
    matchedByPhone,
    newCustomersCreated,
    duplicateRowsSkipped,
    userSkippedRows,
    conflictsCreated,
    enrichedCount,
  };
}

/**
 * Insert a row into the source-specific table.
 * Returns true if inserted, false if skipped (duplicate).
 */
async function insertSourceRow(
  admin: SupabaseClient,
  source: SourceType,
  mapped: Record<string, string | null>,
  customerId: string,
  importId: string,
  rawRow: Record<string, string>,
  rateMap: Map<string, number> = new Map()
): Promise<boolean> {
  if (!customerId) {
    throw new Error(`Cannot insert ${source} row without customer_id (import ${importId})`);
  }

  switch (source) {
    case "stripe": {
      const amount = parseCurrency(mapped.amount ?? "0") ?? 0;
      const currency = (mapped.currency ?? "USD").toUpperCase().trim() || "USD";
      const paymentDate = parseTimestamp(mapped.payment_date ?? "") ?? new Date().toISOString();
      const dateOnly = paymentDate.split("T")[0];
      const fx = toUSD(amount, currency, dateOnly, rateMap);

      const { error } = await admin.from("payments").insert({
        customer_id: customerId,
        import_id: importId,
        external_payment_id: mapped.external_payment_id,
        source: "stripe",
        amount,
        currency,
        status: (mapped.status?.toLowerCase() as "succeeded" | "pending" | "failed" | "refunded") ?? "succeeded",
        payment_date: paymentDate,
        amount_usd: fx.amountUsd,
        fx_rate: fx.rate,
        fx_rate_date: fx.rateDate,
        fx_source: fx.source,
        raw_data: rawRow,
      });

      if (error) {
        if (error.code === "23505") return false;
        throw new Error(`Payment insert failed: ${error.message}`);
      }
      return true;
    }

    case "pos": {
      const amount = parseCurrency(mapped.amount ?? "0") ?? 0;
      const currency = (mapped.currency ?? "USD").toUpperCase().trim() || "USD";
      const paymentDate = parseTimestamp(mapped.payment_date ?? "") ?? new Date().toISOString();
      const dateOnly = paymentDate.split("T")[0];
      const fx = toUSD(amount, currency, dateOnly, rateMap);

      const { error } = await admin.from("payments").insert({
        customer_id: customerId,
        import_id: importId,
        external_payment_id: mapped.external_payment_id,
        source: "pos",
        amount,
        currency,
        status: (mapped.status?.toLowerCase() as "approved" | "succeeded" | "pending" | "failed" | "refunded" | "void") ?? "approved",
        payment_date: paymentDate,
        payment_type: mapped.payment_type ?? null,
        amount_usd: fx.amountUsd,
        fx_rate: fx.rate,
        fx_rate_date: fx.rateDate,
        fx_source: fx.source,
        raw_data: rawRow,
      });

      if (error) {
        if (error.code === "23505") return false;
        throw new Error(`POS payment insert failed: ${error.message}`);
      }
      return true;
    }

    case "calendly": {
      const { error } = await admin.from("bookings").insert({
        customer_id: customerId,
        import_id: importId,
        external_booking_id: mapped.external_booking_id,
        source: "calendly",
        event_type: mapped.event_type,
        start_time: parseTimestamp(mapped.start_time ?? "") ?? new Date().toISOString(),
        end_time: mapped.end_time ? parseTimestamp(mapped.end_time) : null,
        status: (mapped.status?.toLowerCase() as "scheduled" | "completed" | "cancelled" | "no_show" | "confirmed" | "rescheduled") ?? "scheduled",
        raw_data: rawRow,
      });

      if (error) {
        if (error.code === "23505") return false;
        throw new Error(`Booking insert failed: ${error.message}`);
      }
      return true;
    }

    case "wetravel": {
      // DUAL INSERT: one payment record + one booking record
      const bookingDate = parseTimestamp(mapped.booking_date ?? "") ?? new Date().toISOString();
      const bookingId = mapped.external_booking_id;
      const status = mapped.status?.toLowerCase() ?? "confirmed";

      // 1. Insert into payments (WeTravel is always USD)
      const wtAmount = parseCurrency(mapped.amount_paid ?? "0") ?? 0;
      const { error: paymentError } = await admin.from("payments").insert({
        customer_id: customerId,
        import_id: importId,
        external_payment_id: bookingId,
        source: "wetravel",
        amount: wtAmount,
        currency: "USD",
        status: status === "cancelled" ? "refunded" : "succeeded",
        payment_date: bookingDate,
        payment_type: mapped.payment_plan_type ?? null,
        amount_usd: wtAmount,
        fx_rate: 1,
        fx_rate_date: bookingDate.split("T")[0],
        fx_source: "identity",
        raw_data: rawRow,
      });

      if (paymentError) {
        if (paymentError.code === "23505") {
          // Duplicate — skip both inserts
          return false;
        }
        throw new Error(`WeTravel payment insert failed: ${paymentError.message}`);
      }

      // 2. Insert into bookings
      const { error: bookingError } = await admin.from("bookings").insert({
        customer_id: customerId,
        import_id: importId,
        external_booking_id: bookingId,
        source: "wetravel",
        event_type: mapped.trip_name ?? null,
        start_time: bookingDate,
        start_date: mapped.trip_start_date ?? null,
        end_date: mapped.trip_end_date ?? null,
        status: status as "confirmed" | "cancelled" | "completed" | "scheduled" | "rescheduled",
        lead_source_channel: mapped.lead_source_channel ?? null,
        utm_source: mapped.utm_source ?? null,
        utm_medium: mapped.utm_medium ?? null,
        utm_campaign: mapped.utm_campaign ?? null,
        utm_content: mapped.utm_content ?? null,
        referrer: mapped.referrer ?? null,
        referral_partner: mapped.referral_partner ?? null,
        lead_capture_method: mapped.lead_capture_method ?? null,
        raw_data: rawRow,
      });

      if (bookingError) {
        if (bookingError.code === "23505") {
          // Booking duplicate — payment already inserted; treat as success
          // (edge case: payment succeeded but booking was duplicate)
          return true;
        }
        throw new Error(`WeTravel booking insert failed: ${bookingError.message}`);
      }
      return true;
    }

    case "passline": {
      const { error } = await admin.from("attendance").insert({
        customer_id: customerId,
        import_id: importId,
        external_attendance_id: mapped.external_attendance_id,
        source: "passline",
        event_name: mapped.event_name,
        check_in_time: parseTimestamp(mapped.check_in_time ?? "") ?? new Date().toISOString(),
        ticket_type: mapped.ticket_type ?? null,
        raw_data: rawRow,
      });

      if (error) {
        if (error.code === "23505") return false;
        throw new Error(`Attendance insert failed: ${error.message}`);
      }
      return true;
    }

    default:
      throw new Error(`Unknown source: ${source}`);
  }
}

// Need to import SupabaseClient type for insertSourceRow
import type { SupabaseClient } from "@supabase/supabase-js";
