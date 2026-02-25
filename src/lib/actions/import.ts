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
import { getSchema } from "@/lib/csv/schemas";
import {
  stitchIdentity,
  detectPostImportConflicts,
  previewStitchIdentity,
  checkDuplicateRow,
} from "@/lib/stitching/matcher";
import type {
  SourceType,
  ImportResultDetailed,
  PreviewResult,
  ValidationError,
  MappingSuggestion,
  StitchPreviewResult,
  StitchPreviewRow,
  StitchDecisions,
} from "@/lib/types";
import { findMatchingSavedMapping } from "./mappings";

interface UploadOptions {
  source: SourceType;
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
    const rowErrors = validateMappedRow(mapped, schema, i + 1);

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
      validationErrors: allErrors.slice(0, 50), // Limit error count for display
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
  const confidentRows: StitchPreviewRow[] = [];
  const newRows: StitchPreviewRow[] = [];
  const duplicateRows: StitchPreviewRow[] = [];
  const enrichmentRows: StitchPreviewRow[] = [];

  let confidentCount = 0;
  let uncertainCount = 0;
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
    const rowErrors = validateMappedRow(mapped, schema, i + 1);
    if (rowErrors.length > 0) continue;

    totalValid++;

    const externalId = mapped[schema.idField] ?? "";
    const email = mapped[schema.emailField] ?? null;
    const name = schema.nameField ? (mapped[schema.nameField] ?? null) : null;
    const phone = schema.phoneField ? (mapped[schema.phoneField] ?? null) : null;

    // For POS, use membership_id as the stitch external ID
    const stitchExternalId =
      options.source === "pos" && schema.customerIdField
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
    };

    switch (preview.category) {
      case "external_id":
      case "email":
        confidentCount++;
        if (confidentRows.length < 50) confidentRows.push(row);
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
      newCustomers: newCount,
      duplicateRows: duplicateCount,
      enrichments: enrichmentCount,
      totalValidRows: totalValid,
    },
    uncertainRows,
    confidentRows,
    newRows,
    duplicateRows,
    enrichmentRows,
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

  // Process each row
  for (let i = 0; i < parsed.rows.length; i++) {
    const rawRow = parsed.rows[i];
    const mapped = applyMapping(rawRow, mapping);
    if (mapped.status) {
      mapped.status = normalizeStatus(mapped.status, options.source);
    }
    const rowErrors = validateMappedRow(mapped, schema, i + 1);

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

      // For POS, use membership_id as the stitch external ID
      const stitchExternalId =
        options.source === "pos" && schema.customerIdField
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

      if (decision) {
        if (decision.action === "merge") {
          forceId = decision.targetCustomerId;
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
        enrichFields
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

      // Insert into source-specific table
      const inserted = await insertSourceRow(
        admin,
        options.source,
        mapped,
        customerId,
        importId,
        rawRow
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
  rawRow: Record<string, string>
): Promise<boolean> {
  switch (source) {
    case "stripe": {
      const { error } = await admin.from("payments").insert({
        customer_id: customerId,
        import_id: importId,
        external_payment_id: mapped.external_payment_id,
        source: "stripe",
        amount: parseCurrency(mapped.amount ?? "0") ?? 0,
        currency: mapped.currency ?? "USD",
        status: (mapped.status?.toLowerCase() as "succeeded" | "pending" | "failed" | "refunded") ?? "succeeded",
        payment_date: parseTimestamp(mapped.payment_date ?? "") ?? new Date().toISOString(),
        raw_data: rawRow,
      });

      if (error) {
        // Check for unique constraint violation (duplicate)
        if (error.code === "23505") return false;
        throw new Error(`Payment insert failed: ${error.message}`);
      }
      return true;
    }

    case "pos": {
      const { error } = await admin.from("payments").insert({
        customer_id: customerId,
        import_id: importId,
        external_payment_id: mapped.external_payment_id,
        source: "pos",
        amount: parseCurrency(mapped.amount ?? "0") ?? 0,
        currency: mapped.currency ?? "USD",
        status: (mapped.status?.toLowerCase() as "approved" | "succeeded" | "pending" | "failed" | "refunded") ?? "approved",
        payment_date: parseTimestamp(mapped.payment_date ?? "") ?? new Date().toISOString(),
        payment_type: mapped.payment_type ?? null,
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
        status: (mapped.status?.toLowerCase() as "scheduled" | "completed" | "cancelled" | "no_show") ?? "scheduled",
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

      // 1. Insert into payments
      const { error: paymentError } = await admin.from("payments").insert({
        customer_id: customerId,
        import_id: importId,
        external_payment_id: bookingId,
        source: "wetravel",
        amount: parseCurrency(mapped.amount_paid ?? "0") ?? 0,
        currency: "USD",
        status: status === "cancelled" ? "refunded" : "succeeded",
        payment_date: bookingDate,
        payment_type: mapped.payment_plan_type ?? null,
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
        status: status as "confirmed" | "cancelled" | "completed" | "scheduled",
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
