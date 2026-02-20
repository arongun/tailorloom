import { NextResponse } from "next/server";
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
import type { SourceType, ValidationError } from "@/lib/types";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Test route for CSV import pipeline.
 * GET /api/test-import — imports all 3 test CSVs and returns results.
 *
 * This route bypasses auth and uses the admin client directly.
 * It's only for development testing.
 */
export async function GET() {
  const admin = createAdminClient();
  const results: Record<string, unknown> = {};

  const sources: { source: SourceType; file: string }[] = [
    { source: "stripe", file: "stripe_export.csv" },
    { source: "calendly", file: "calendly_export.csv" },
    { source: "passline", file: "passline_export.csv" },
  ];

  for (const { source, file } of sources) {
    try {
      const content = readFileSync(
        join(process.cwd(), "src/lib/csv/test-data", file),
        "utf-8"
      );

      const schema = getSchema(source)!;
      const parsed = parseCSVContent(content);

      // Auto-map columns
      const suggestions = generateMappingSuggestions(
        parsed.headers,
        schema,
        parsed.sampleRows
      );
      const mapping = suggestionsToMapping(suggestions);

      // Create import record
      const { data: importRecord, error: importError } = await admin
        .from("import_history")
        .insert({
          source,
          file_name: file,
          file_size_bytes: Buffer.byteLength(content),
          total_rows: parsed.totalRows,
          status: "processing",
          column_mapping: mapping,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (importError) {
        results[source] = { error: importError.message };
        continue;
      }

      const importId = importRecord.id;
      let importedRows = 0;
      let skippedRows = 0;
      let errorRows = 0;
      const errors: ValidationError[] = [];

      for (let i = 0; i < parsed.rows.length; i++) {
        const rawRow = parsed.rows[i];
        const mapped = applyMapping(rawRow, mapping);
        if (mapped.status) {
          mapped.status = normalizeStatus(mapped.status, source);
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

          const { customerId } = await stitchIdentity(
            admin,
            source,
            externalId,
            email,
            name
          );

          // Insert into source-specific table
          let inserted = false;

          if (source === "stripe") {
            const { error } = await admin.from("payments").insert({
              customer_id: customerId,
              import_id: importId,
              stripe_payment_id: mapped.stripe_payment_id,
              stripe_customer_id: mapped.stripe_customer_id,
              amount: parseCurrency(mapped.amount ?? "0") ?? 0,
              currency: mapped.currency ?? "USD",
              status: (mapped.status?.toLowerCase() ?? "succeeded") as "succeeded" | "pending" | "failed" | "refunded",
              payment_date: parseTimestamp(mapped.payment_date ?? "") ?? new Date().toISOString(),
              description: mapped.description,
              raw_data: rawRow,
            });
            if (error) {
              if (error.code === "23505") { skippedRows++; continue; }
              throw error;
            }
            inserted = true;
          } else if (source === "calendly") {
            const { error } = await admin.from("bookings").insert({
              customer_id: customerId,
              import_id: importId,
              calendly_event_id: mapped.calendly_event_id,
              event_type: mapped.event_type,
              start_time: parseTimestamp(mapped.start_time ?? "") ?? new Date().toISOString(),
              end_time: mapped.end_time ? parseTimestamp(mapped.end_time) : null,
              status: (mapped.status?.toLowerCase() ?? "scheduled") as "scheduled" | "completed" | "cancelled" | "no_show",
              raw_data: rawRow,
            });
            if (error) {
              if (error.code === "23505") { skippedRows++; continue; }
              throw error;
            }
            inserted = true;
          } else if (source === "passline") {
            const { error } = await admin.from("attendance").insert({
              customer_id: customerId,
              import_id: importId,
              passline_id: mapped.passline_id,
              event_name: mapped.event_name,
              check_in_time: parseTimestamp(mapped.check_in_time ?? "") ?? new Date().toISOString(),
              raw_data: rawRow,
            });
            if (error) {
              if (error.code === "23505") { skippedRows++; continue; }
              throw error;
            }
            inserted = true;
          }

          if (inserted) importedRows++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ row: i + 1, field: "", message: msg });
          errorRows++;
        }
      }

      // Update import record
      await admin
        .from("import_history")
        .update({
          imported_rows: importedRows,
          skipped_rows: skippedRows,
          error_rows: errorRows,
          status: errorRows === parsed.totalRows ? "failed" : "completed",
          errors: errors.length > 0 ? errors.slice(0, 100) : null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", importId);

      // Post-import conflict detection
      const conflictsFound = await detectPostImportConflicts(admin, importId);

      results[source] = {
        importId,
        totalRows: parsed.totalRows,
        importedRows,
        skippedRows,
        errorRows,
        conflictsFound,
        mapping,
        suggestions: suggestions.map((s) => ({
          csv: s.csvHeader,
          field: s.schemaField,
          confidence: s.confidence,
          match: s.matchType,
        })),
        errors: errors.slice(0, 10),
      };
    } catch (err) {
      results[source] = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Verification queries
  const { data: customerCount } = await admin
    .from("customers")
    .select("id", { count: "exact", head: true });

  const { data: janeCustomer } = await admin
    .from("customers")
    .select("id, name, email")
    .eq("email", "jane@example.com");

  let janeSources = null;
  if (janeCustomer && janeCustomer.length > 0) {
    const { data } = await admin
      .from("customer_sources")
      .select("source, external_id, external_email")
      .eq("customer_id", janeCustomer[0].id);
    janeSources = data;
  }

  const { data: conflicts } = await admin
    .from("stitching_conflicts")
    .select("customer_a_id, customer_b_id, match_field, match_value, confidence, status");

  const { data: importHistory } = await admin
    .from("import_history")
    .select("id, source, file_name, total_rows, imported_rows, skipped_rows, error_rows, status");

  return NextResponse.json({
    results,
    verification: {
      totalCustomers: customerCount,
      janeCustomer,
      janeSources,
      conflicts,
      importHistory,
    },
  });
}
