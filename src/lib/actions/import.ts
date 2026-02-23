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

  let confidentCount = 0;
  let uncertainCount = 0;
  let newCount = 0;
  let duplicateCount = 0;
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
    const name = mapped[schema.nameField] ?? null;

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
            category: "duplicate",
            existingCustomerId: null,
            existingCustomerName: null,
            existingCustomerEmail: null,
            confidence: 1,
          });
        }
        continue;
      }
    }

    // Preview stitch
    const preview = await previewStitchIdentity(admin, options.source, externalId, email, name);

    const row: StitchPreviewRow = {
      rowIndex: i + 1,
      externalId,
      email,
      name,
      category: preview.category,
      existingCustomerId: preview.existingCustomerId,
      existingCustomerName: preview.existingCustomerName,
      existingCustomerEmail: preview.existingCustomerEmail,
      confidence: preview.confidence,
    };

    switch (preview.category) {
      case "external_id":
      case "email":
        confidentCount++;
        if (confidentRows.length < 50) confidentRows.push(row);
        break;
      case "name_conflict":
        uncertainCount++;
        uncertainRows.push(row); // Keep all uncertain rows — user must decide
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
      totalValidRows: totalValid,
    },
    uncertainRows,
    confidentRows,
    newRows,
    duplicateRows,
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
  let newCustomersCreated = 0;
  let duplicateRowsSkipped = 0;
  let userSkippedRows = 0;
  let conflictsCreated = 0;

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
      const name = mapped[schema.nameField] ?? null;

      // Check for user skip decision
      const decision = decisions[i + 1]; // decisions are keyed by 1-based row index
      if (decision && decision.action === "skip") {
        userSkippedRows++;
        skippedRows++;
        continue;
      }

      // Determine forceCustomerId from user merge decision
      const forceId =
        decision && decision.action === "merge"
          ? decision.targetCustomerId
          : undefined;

      // Stitch identity
      const { customerId, isNew, matchedBy } = await stitchIdentity(
        admin,
        options.source,
        externalId,
        email,
        name,
        forceId
      );

      // Track match type
      if (forceId) {
        matchedByEmail++; // User-forced merges count as manual match
      } else if (matchedBy === "external_id") {
        matchedByExternalId++;
      } else if (matchedBy === "email") {
        matchedByEmail++;
      } else if (isNew && matchedBy === "name") {
        // name_conflict — created new + flagged conflict
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
    errorRows === parsed.totalRows ? "failed" : "completed";

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
    newCustomersCreated,
    duplicateRowsSkipped,
    userSkippedRows,
    conflictsCreated,
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
        stripe_payment_id: mapped.stripe_payment_id,
        stripe_customer_id: mapped.stripe_customer_id,
        amount: parseCurrency(mapped.amount ?? "0") ?? 0,
        currency: mapped.currency ?? "USD",
        status: (mapped.status?.toLowerCase() as "succeeded" | "pending" | "failed" | "refunded") ?? "succeeded",
        payment_date: parseTimestamp(mapped.payment_date ?? "") ?? new Date().toISOString(),
        description: mapped.description,
        raw_data: rawRow,
      });

      if (error) {
        // Check for unique constraint violation (duplicate stripe_payment_id)
        if (error.code === "23505") return false;
        throw new Error(`Payment insert failed: ${error.message}`);
      }
      return true;
    }

    case "calendly": {
      const { error } = await admin.from("bookings").insert({
        customer_id: customerId,
        import_id: importId,
        calendly_event_id: mapped.calendly_event_id,
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

    case "passline": {
      const { error } = await admin.from("attendance").insert({
        customer_id: customerId,
        import_id: importId,
        passline_id: mapped.passline_id,
        event_name: mapped.event_name,
        check_in_time: parseTimestamp(mapped.check_in_time ?? "") ?? new Date().toISOString(),
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
