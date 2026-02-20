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
import { stitchIdentity, detectPostImportConflicts } from "@/lib/stitching/matcher";
import type {
  SourceType,
  ImportResult,
  PreviewResult,
  ValidationError,
  MappingSuggestion,
} from "@/lib/types";
import { findMatchingSavedMapping } from "./mappings";

interface UploadOptions {
  source: SourceType;
  fileName: string;
  content: string;
  mapping?: Record<string, string>;
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
 * Full CSV import: parse, map, validate, stitch identities, write to DB.
 */
export async function uploadCSV(options: UploadOptions): Promise<ImportResult> {
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

  // Process each row
  for (let i = 0; i < parsed.rows.length; i++) {
    const rawRow = parsed.rows[i];
    const mapped = applyMapping(rawRow, mapping);
    // Normalize status field before validation
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
      // Extract identity fields
      const externalId = mapped[schema.idField] ?? "";
      const email = mapped[schema.emailField] ?? null;
      const name = mapped[schema.nameField] ?? null;

      // Stitch identity
      const { customerId } = await stitchIdentity(
        admin,
        options.source,
        externalId,
        email,
        name
      );

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
        skippedRows++; // Duplicate
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
  await detectPostImportConflicts(admin, importId);

  return {
    importId,
    totalRows: parsed.totalRows,
    importedRows,
    skippedRows,
    errorRows,
    errors,
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
