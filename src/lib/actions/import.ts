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
  shouldUpdateName,
} from "@/lib/stitching/matcher";
import { normalizePhone } from "@/lib/stitching/phone-utils";
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
      flaggedCount: 0,
      totalValidRows: totalValid,
    },
    uncertainRows,
    nameReviewRows,
    confidentRows,
    newRows,
    duplicateRows,
    enrichmentRows,
    flaggedRows: [],
    warnings: allWarnings.slice(0, 50),
  };
}

/**
 * Preview CRM stitching: read-only lookup per row to count matches vs new.
 * Returns summary counts only (no row arrays) for multi-file batch preview.
 * Uses preloaded in-memory indexes for O(1) DB round-trips per file.
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

  // Preload all customers and POS sources in 2 queries total
  const [customersRes, posSourcesRes] = await Promise.all([
    admin
      .from("customers")
      .select("id, email, phone")
      .eq("org_id", DEFAULT_ORG_ID),
    admin
      .from("customer_sources")
      .select("external_id, customer_id")
      .eq("source", "pos"),
  ]);

  // Build in-memory indexes
  const emailSet = new Set<string>();
  const normalizedPhoneSet = new Set<string>();
  const memberIdSet = new Set<string>();

  if (customersRes.data) {
    for (const c of customersRes.data) {
      if (c.email) emailSet.add(c.email.trim().toLowerCase());
      if (c.phone) {
        const norm = normalizePhone(c.phone);
        if (norm) normalizedPhoneSet.add(norm);
      }
    }
  }

  if (posSourcesRes.data) {
    for (const s of posSourcesRes.data) {
      if (s.external_id) memberIdSet.add(s.external_id);
    }
  }

  let confidentCount = 0;
  let newCount = 0;
  let totalValid = 0;

  for (let i = 0; i < parsed.rows.length; i++) {
    const rawRow = parsed.rows[i];
    const mapped = applyMapping(rawRow, options.mapping);
    const { errors: rowErrors } = validateMappedRow(mapped, schema, i + 1);
    if (rowErrors.length > 0) continue;

    const email = mapped.email ?? null;
    const phone = mapped.phone ?? null;
    const memberId = mapped.member_id ?? null;

    // Identifier guardrail — matches import-time check
    if (!email && !phone && !memberId) continue;

    totalValid++;

    // Email lookup (in-memory)
    if (email && emailSet.has(email.trim().toLowerCase())) {
      confidentCount++;
      continue;
    }

    // Phone lookup (in-memory)
    if (phone) {
      const normalized = normalizePhone(phone);
      if (normalized && normalizedPhoneSet.has(normalized)) {
        confidentCount++;
        continue;
      }
    }

    // Member ID lookup (in-memory)
    if (memberId && memberIdSet.has(memberId)) {
      confidentCount++;
      continue;
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
      flaggedCount: 0,
      totalValidRows: totalValid,
    },
    uncertainRows: [],
    nameReviewRows: [],
    confidentRows: [],
    newRows: [],
    duplicateRows: [],
    enrichmentRows: [],
    flaggedRows: [],
    warnings: [],
  };
}

/**
 * Preview Attribution stitching: read-only lookup per row to count matches vs new.
 * Returns summary counts only (no row arrays) for multi-file batch preview.
 * Uses preloaded in-memory indexes for O(1) DB round-trips per file.
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

  // Preload all customers in 1 query
  const { data: customers } = await admin
    .from("customers")
    .select("id, email, phone")
    .eq("org_id", DEFAULT_ORG_ID);

  // Build in-memory indexes
  const emailSet = new Set<string>();
  const normalizedPhoneSet = new Set<string>();

  if (customers) {
    for (const c of customers) {
      if (c.email) emailSet.add(c.email.trim().toLowerCase());
      if (c.phone) {
        const norm = normalizePhone(c.phone);
        if (norm) normalizedPhoneSet.add(norm);
      }
    }
  }

  let confidentCount = 0;
  let newCount = 0;
  let totalValid = 0;

  for (let i = 0; i < parsed.rows.length; i++) {
    const rawRow = parsed.rows[i];
    const mapped = applyMapping(rawRow, options.mapping);
    const { errors: rowErrors } = validateMappedRow(mapped, schema, i + 1);
    if (rowErrors.length > 0) continue;

    const email = mapped.email ?? null;
    const phone = mapped.phone ?? null;

    // Identifier guardrail — matches import-time check
    if (!email && !phone) continue;

    totalValid++;

    // Email lookup (in-memory)
    if (email && emailSet.has(email.trim().toLowerCase())) {
      confidentCount++;
      continue;
    }

    // Phone lookup (in-memory)
    if (phone) {
      const normalized = normalizePhone(phone);
      if (normalized && normalizedPhoneSet.has(normalized)) {
        confidentCount++;
        continue;
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
      flaggedCount: 0,
      totalValidRows: totalValid,
    },
    uncertainRows: [],
    nameReviewRows: [],
    confidentRows: [],
    newRows: [],
    duplicateRows: [],
    enrichmentRows: [],
    flaggedRows: [],
    warnings: [],
  };
}

/**
 * Fast in-memory stitch preview: preloads customer data in 2 parallel queries
 * (customers + customer_sources), then a follow-up for duplicate-check data.
 * Replicates the previewStitchIdentity cascade entirely in-memory.
 * Used by both single-file and multi-file flows.
 *
 * Flags rows with validation errors or no usable identifiers as "flagged"
 * instead of silently dropping them. Identifier guardrails are source-aware:
 * CRM requires email/phone/member_id, attribution requires email/phone,
 * transaction sources use the full stitch cascade.
 */
export async function previewStitchingFast(options: {
  source: SourceType;
  content: string;
  mapping: Record<string, string>;
}): Promise<StitchPreviewResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const schema = getSchema(options.source);
  if (!schema) throw new Error(`Unknown source: ${options.source}`);

  const parsed = parseCSVContent(options.content);

  // ─── Preload data in parallel ─────────────────────────────
  const [customersRes, customerSourcesRes] = await Promise.all([
    admin
      .from("customers")
      .select("id, email, phone, full_name")
      .eq("org_id", DEFAULT_ORG_ID),
    admin
      .from("customer_sources")
      .select("source, external_id, customer_id, external_email, customers(id, full_name, email, phone)")
  ]);

  // Also preload duplicate-check data based on source
  let existingExternalIds: Set<string> | null = null;
  {
    let table: string | null = null;
    let idColumn: string | null = null;
    let sourceFilter: string | null = null;
    switch (options.source) {
      case "stripe": table = "payments"; idColumn = "external_payment_id"; sourceFilter = "stripe"; break;
      case "pos": table = "payments"; idColumn = "external_payment_id"; sourceFilter = "pos"; break;
      case "calendly": table = "bookings"; idColumn = "external_booking_id"; sourceFilter = "calendly"; break;
      case "wetravel": table = "bookings"; idColumn = "external_booking_id"; sourceFilter = "wetravel"; break;
      case "passline": table = "attendance"; idColumn = "external_attendance_id"; sourceFilter = "passline"; break;
    }
    if (table && idColumn && sourceFilter) {
      const { data } = await admin.from(table).select(idColumn).eq("source", sourceFilter);
      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        existingExternalIds = new Set(data.map((r: any) => r[idColumn!] as string));
      }
    }
  }

  // ─── Build in-memory indexes ──────────────────────────────
  type CustomerRecord = { id: string; full_name: string | null; email: string | null; phone: string | null };

  const emailMap = new Map<string, CustomerRecord>();
  const phoneMap = new Map<string, CustomerRecord>();
  const nameMap = new Map<string, CustomerRecord[]>();

  if (customersRes.data) {
    for (const c of customersRes.data) {
      const rec: CustomerRecord = { id: c.id, full_name: c.full_name, email: c.email, phone: c.phone };
      if (c.email) emailMap.set(c.email.trim().toLowerCase(), rec);
      if (c.phone) {
        const norm = normalizePhone(c.phone);
        if (norm) phoneMap.set(norm, rec);
      }
      if (c.full_name) {
        const key = c.full_name.toLowerCase();
        const arr = nameMap.get(key) ?? [];
        if (arr.length < 5) arr.push(rec);
        nameMap.set(key, arr);
      }
    }
  }

  // source:external_id → { customer_id, customer record }
  const sourceIdMap = new Map<string, { customerId: string; customer: CustomerRecord | null }>();
  // external_email → { customer_id, customer record }
  const extEmailMap = new Map<string, { customerId: string; customer: CustomerRecord | null }>();

  if (customerSourcesRes.data) {
    for (const s of customerSourcesRes.data) {
      const cArr = s.customers as unknown as CustomerRecord[] | null;
      const c = cArr?.[0] ?? null;
      sourceIdMap.set(`${s.source}:${s.external_id}`, { customerId: s.customer_id, customer: c });
      if (s.external_email) {
        extEmailMap.set(s.external_email.trim().toLowerCase(), { customerId: s.customer_id, customer: c });
      }
    }
  }

  // ─── Pure helper functions (replicated from matcher.ts) ───
  function detectEnrichableFields(
    existing: { full_name: string | null; email: string | null; phone: string | null },
    name: string | null,
    email: string | null,
    phone: string | null
  ): import("@/lib/types").EnrichableField[] {
    const fields: import("@/lib/types").EnrichableField[] = [];
    if (!existing.full_name && name) fields.push({ field: "full_name", existingValue: null, newValue: name });
    if (!existing.email && email) fields.push({ field: "email", existingValue: null, newValue: email });
    if (!existing.phone && phone) fields.push({ field: "phone", existingValue: null, newValue: phone });
    return fields;
  }

  function hasConflictingFields(
    existing: { full_name: string | null; email: string | null },
    name: string | null,
    email: string | null
  ): boolean {
    if (existing.full_name && name && existing.full_name.toLowerCase() !== name.toLowerCase()) return true;
    if (existing.email && email && existing.email.toLowerCase() !== email.toLowerCase()) return true;
    return false;
  }

  // ─── Process rows ─────────────────────────────────────────
  const uncertainRows: StitchPreviewRow[] = [];
  const nameReviewRows: StitchPreviewRow[] = [];
  const confidentRows: StitchPreviewRow[] = [];
  const newRows: StitchPreviewRow[] = [];
  const duplicateRows: StitchPreviewRow[] = [];
  const enrichmentRows: StitchPreviewRow[] = [];
  const flaggedRows: StitchPreviewRow[] = [];
  const allWarnings: ValidationError[] = [];

  let confidentCount = 0;
  let uncertainCount = 0;
  let nameReviewCount = 0;
  let newCount = 0;
  let duplicateCount = 0;
  let enrichmentCount = 0;
  let flaggedCount = 0;
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

    // Flagged: validation errors (instead of silent skip)
    if (rowErrors.length > 0) {
      flaggedCount++;
      flaggedRows.push({
        rowIndex: i + 1,
        externalId: mapped[schema.idField] ?? "",
        email: mapped[schema.emailField] ?? null,
        name: schema.nameField ? (mapped[schema.nameField] ?? null) : null,
        phone: schema.phoneField ? (mapped[schema.phoneField] ?? null) : null,
        category: "flagged",
        existingCustomerId: null,
        existingCustomerName: null,
        existingCustomerEmail: null,
        confidence: 0,
        candidates: [],
        enrichableFields: [],
        rawRow,
        flagReason: rowErrors.map((e) => e.message).join("; "),
      });
      continue;
    }

    const externalId = mapped[schema.idField] ?? "";
    const email = mapped[schema.emailField] ?? null;
    const name = schema.nameField ? (mapped[schema.nameField] ?? null) : null;
    const phone = schema.phoneField ? (mapped[schema.phoneField] ?? null) : null;

    const stitchExternalId =
      schema.customerIdField
        ? (mapped[schema.customerIdField] ?? externalId)
        : externalId;

    // Flagged: no usable identifier — must match import-time guardrails per source
    const memberId = mapped.member_id ?? null;
    let noIdentifier = false;
    let flagMsg = "";
    if (options.source === "crm") {
      // CRM requires email, phone, or member_id
      if (!email && !phone && !memberId) {
        noIdentifier = true;
        flagMsg = "No usable identifier (need email, phone, or member_id)";
      }
    } else if (options.source === "attribution") {
      // Attribution requires email or phone
      if (!email && !phone) {
        noIdentifier = true;
        flagMsg = "No usable identifier (need email or phone)";
      }
    } else {
      // Transaction sources use full stitch cascade — only flag if nothing at all
      if (!stitchExternalId && !email && !phone && !name) {
        noIdentifier = true;
        flagMsg = "No usable identifier (no ID, email, phone, or name)";
      }
    }
    if (noIdentifier) {
      flaggedCount++;
      flaggedRows.push({
        rowIndex: i + 1,
        externalId: externalId || "",
        email,
        name,
        phone,
        category: "flagged",
        existingCustomerId: null,
        existingCustomerName: null,
        existingCustomerEmail: null,
        confidence: 0,
        candidates: [],
        enrichableFields: [],
        rawRow,
        flagReason: flagMsg,
      });
      continue;
    }

    totalValid++;

    // Duplicate check
    if (externalId && existingExternalIds?.has(externalId)) {
      duplicateCount++;
      if (duplicateRows.length < 50) {
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

    // ─── In-memory stitch cascade ─────────────────────────

    // 1. External ID match via sourceIdMap
    if (stitchExternalId) {
      const sourceKey = `${options.source}:${stitchExternalId}`;
      const match = sourceIdMap.get(sourceKey);
      if (match) {
        const c = match.customer;
        if (c) {
          const ef = detectEnrichableFields(c, name, email, phone);
          if (ef.length > 0 && !hasConflictingFields(c, name, email)) {
            enrichmentCount++;
            enrichmentRows.push({
              rowIndex: i + 1, externalId, email, name, phone,
              category: "enrichment",
              existingCustomerId: match.customerId,
              existingCustomerName: c.full_name,
              existingCustomerEmail: c.email,
              confidence: 1.0,
              candidates: [], enrichableFields: ef, rawRow,
            });
            continue;
          }
        }
        confidentCount++;
        if (confidentRows.length < 50) {
          confidentRows.push({
            rowIndex: i + 1, externalId, email, name, phone,
            category: "external_id",
            existingCustomerId: match.customerId,
            existingCustomerName: c?.full_name ?? null,
            existingCustomerEmail: c?.email ?? null,
            confidence: 1.0,
            candidates: [], enrichableFields: [], rawRow,
          });
        }
        continue;
      }
    }

    // 2. Email match — customers table
    if (email) {
      const emailKey = email.trim().toLowerCase();
      const customerMatch = emailMap.get(emailKey);
      if (customerMatch) {
        const ef = detectEnrichableFields(customerMatch, name, email, phone);
        if (ef.length > 0 && !hasConflictingFields(customerMatch, name, email)) {
          enrichmentCount++;
          enrichmentRows.push({
            rowIndex: i + 1, externalId, email, name, phone,
            category: "enrichment",
            existingCustomerId: customerMatch.id,
            existingCustomerName: customerMatch.full_name,
            existingCustomerEmail: customerMatch.email,
            confidence: 0.95,
            candidates: [], enrichableFields: ef, rawRow,
          });
          continue;
        }

        // Name mismatch check
        if (name && customerMatch.full_name && customerMatch.full_name.toLowerCase() !== name.toLowerCase()) {
          nameReviewCount++;
          nameReviewRows.push({
            rowIndex: i + 1, externalId, email, name, phone,
            category: "email_name_mismatch",
            existingCustomerId: customerMatch.id,
            existingCustomerName: customerMatch.full_name,
            existingCustomerEmail: customerMatch.email,
            confidence: 0.95,
            candidates: [], enrichableFields: [], rawRow,
          });
          continue;
        }

        confidentCount++;
        if (confidentRows.length < 50) {
          confidentRows.push({
            rowIndex: i + 1, externalId, email, name, phone,
            category: "email",
            existingCustomerId: customerMatch.id,
            existingCustomerName: customerMatch.full_name,
            existingCustomerEmail: customerMatch.email,
            confidence: 0.95,
            candidates: [], enrichableFields: [], rawRow,
          });
        }
        continue;
      }

      // Email match — customer_sources external_email
      const extMatch = extEmailMap.get(emailKey);
      if (extMatch) {
        const c = extMatch.customer;
        if (c) {
          const ef = detectEnrichableFields(c, name, email, phone);
          if (ef.length > 0 && !hasConflictingFields(c, name, email)) {
            enrichmentCount++;
            enrichmentRows.push({
              rowIndex: i + 1, externalId, email, name, phone,
              category: "enrichment",
              existingCustomerId: extMatch.customerId,
              existingCustomerName: c.full_name,
              existingCustomerEmail: c.email,
              confidence: 0.9,
              candidates: [], enrichableFields: ef, rawRow,
            });
            continue;
          }

          // Name mismatch on source email
          if (name && c.full_name && c.full_name.toLowerCase() !== name.toLowerCase()) {
            nameReviewCount++;
            nameReviewRows.push({
              rowIndex: i + 1, externalId, email, name, phone,
              category: "email_name_mismatch",
              existingCustomerId: extMatch.customerId,
              existingCustomerName: c.full_name,
              existingCustomerEmail: c.email,
              confidence: 0.9,
              candidates: [], enrichableFields: [], rawRow,
            });
            continue;
          }
        }

        confidentCount++;
        if (confidentRows.length < 50) {
          confidentRows.push({
            rowIndex: i + 1, externalId, email, name, phone,
            category: "email",
            existingCustomerId: extMatch.customerId,
            existingCustomerName: c?.full_name ?? null,
            existingCustomerEmail: c?.email ?? null,
            confidence: 0.9,
            candidates: [], enrichableFields: [], rawRow,
          });
        }
        continue;
      }
    }

    // 3. Phone match
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone) {
      // Check all phone matches (iterate phoneMap for phonesMatch)
      const phoneMatches: CustomerRecord[] = [];
      for (const [, rec] of phoneMap) {
        if (normalizePhone(rec.phone) === normalizedPhone) {
          phoneMatches.push(rec);
        }
      }

      if (phoneMatches.length === 1) {
        const match = phoneMatches[0];
        const ef = detectEnrichableFields(match, name, email, phone);
        if (ef.length > 0 && !hasConflictingFields(match, name, email)) {
          enrichmentCount++;
          enrichmentRows.push({
            rowIndex: i + 1, externalId, email, name, phone,
            category: "enrichment",
            existingCustomerId: match.id,
            existingCustomerName: match.full_name,
            existingCustomerEmail: match.email,
            confidence: 0.75,
            candidates: [], enrichableFields: ef, rawRow,
          });
          continue;
        }
        uncertainCount++;
        uncertainRows.push({
          rowIndex: i + 1, externalId, email, name, phone,
          category: "phone",
          existingCustomerId: match.id,
          existingCustomerName: match.full_name,
          existingCustomerEmail: match.email,
          confidence: 0.75,
          candidates: [{
            customerId: match.id,
            customerName: match.full_name,
            customerEmail: match.email,
            customerPhone: match.phone,
            matchedBy: "phone",
            confidence: 0.75,
          }],
          enrichableFields: [], rawRow,
        });
        continue;
      }

      if (phoneMatches.length > 1) {
        uncertainCount++;
        uncertainRows.push({
          rowIndex: i + 1, externalId, email, name, phone,
          category: "phone",
          existingCustomerId: phoneMatches[0].id,
          existingCustomerName: phoneMatches[0].full_name,
          existingCustomerEmail: phoneMatches[0].email,
          confidence: 0.6,
          candidates: phoneMatches.map((m) => ({
            customerId: m.id,
            customerName: m.full_name,
            customerEmail: m.email,
            customerPhone: m.phone,
            matchedBy: "phone" as const,
            confidence: 0.6,
          })),
          enrichableFields: [], rawRow,
        });
        continue;
      }
    }

    // 4. Name match
    if (name) {
      const nameMatches = nameMap.get(name.toLowerCase());
      if (nameMatches && nameMatches.length > 0) {
        if (nameMatches.length === 1) {
          const existing = nameMatches[0];
          const isConflict = existing.email && email && existing.email.toLowerCase() !== email.toLowerCase();
          const category = isConflict ? "name_conflict" as const : "name_match" as const;

          uncertainCount++;
          uncertainRows.push({
            rowIndex: i + 1, externalId, email, name, phone,
            category,
            existingCustomerId: existing.id,
            existingCustomerName: existing.full_name,
            existingCustomerEmail: existing.email,
            confidence: 0.65,
            candidates: [{
              customerId: existing.id,
              customerName: existing.full_name,
              customerEmail: existing.email,
              customerPhone: existing.phone,
              matchedBy: "name",
              confidence: 0.65,
            }],
            enrichableFields: [], rawRow,
          });
          continue;
        }

        // Multiple name matches
        uncertainCount++;
        uncertainRows.push({
          rowIndex: i + 1, externalId, email, name, phone,
          category: "name_match",
          existingCustomerId: nameMatches[0].id,
          existingCustomerName: nameMatches[0].full_name,
          existingCustomerEmail: nameMatches[0].email,
          confidence: 0.5,
          candidates: nameMatches.map((c) => ({
            customerId: c.id,
            customerName: c.full_name,
            customerEmail: c.email,
            customerPhone: c.phone,
            matchedBy: "name" as const,
            confidence: 0.5,
          })),
          enrichableFields: [], rawRow,
        });
        continue;
      }
    }

    // 5. No match — new customer
    newCount++;
    if (newRows.length < 50) {
      newRows.push({
        rowIndex: i + 1, externalId, email, name, phone,
        category: "new",
        existingCustomerId: null,
        existingCustomerName: null,
        existingCustomerEmail: null,
        confidence: 0,
        candidates: [], enrichableFields: [], rawRow,
      });
    }
  }

  // ─── Dev-only parity check ──────────────────────────────
  if (process.env.NODE_ENV === "development") {
    const sampleRows = [...confidentRows.slice(0, 3), ...uncertainRows.slice(0, 3), ...newRows.slice(0, 4)];
    const parityChecks = sampleRows.slice(0, 10).map(async (row) => {
      try {
        const original = await previewStitchIdentity(
          admin, options.source,
          schema.customerIdField ? (row.rawRow?.[schema.customerIdField] ?? row.externalId) : row.externalId,
          row.email, row.name, row.phone
        );
        if (original.category !== row.category) {
          console.warn(`[parity] row ${row.rowIndex}: fast=${row.category}, original=${original.category}`);
        }
      } catch {
        // Parity check is best-effort
      }
    });
    // Fire and forget — don't block the response
    Promise.all(parityChecks).catch(() => {});
  }

  return {
    summary: {
      confidentMatches: confidentCount,
      uncertainMatches: uncertainCount,
      nameReviewMatches: nameReviewCount,
      newCustomers: newCount,
      duplicateRows: duplicateCount,
      enrichments: enrichmentCount,
      flaggedCount,
      totalValidRows: totalValid,
    },
    uncertainRows,
    nameReviewRows,
    confidentRows,
    newRows,
    duplicateRows,
    enrichmentRows,
    flaggedRows,
    warnings: allWarnings.slice(0, 50),
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

    // Preload customer data for fast in-memory matching
    const { data: attrCustomers } = await admin
      .from("customers")
      .select("id, email, phone, full_name, name_source")
      .eq("org_id", DEFAULT_ORG_ID);

    const attrEmailIndex = new Map<string, { id: string; full_name: string | null; name_source: string | null }>();
    const attrPhoneIndex = new Map<string, string>();

    if (attrCustomers) {
      for (const c of attrCustomers) {
        if (c.email) attrEmailIndex.set(c.email.trim().toLowerCase(), { id: c.id, full_name: c.full_name, name_source: c.name_source });
        if (c.phone) {
          const norm = normalizePhone(c.phone);
          if (norm) attrPhoneIndex.set(norm, c.id);
        }
      }
    }

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
        let customerId: string | null = null;
        let isNew = false;

        // 1. Email match (in-memory)
        if (email) {
          const key = email.trim().toLowerCase();
          const match = attrEmailIndex.get(key);
          if (match) {
            customerId = match.id;
            if (name && (!match.full_name || shouldUpdateName(match.name_source, "attribution"))) {
              await admin.from("customers").update({
                full_name: name,
                name_source: "attribution",
                updated_at: new Date().toISOString(),
              }).eq("id", match.id);
              attrEmailIndex.set(key, { ...match, full_name: name, name_source: "attribution" });
            }
          }
        }

        // 2. Phone match (in-memory)
        if (!customerId && phone) {
          const norm = normalizePhone(phone);
          if (norm) {
            const matchId = attrPhoneIndex.get(norm);
            if (matchId) customerId = matchId;
          }
        }

        // 3. No match — create new customer
        if (!customerId) {
          const { data: newCust, error: newCustErr } = await admin
            .from("customers")
            .insert({
              org_id: DEFAULT_ORG_ID,
              email,
              full_name: name,
              phone: phone ?? null,
              name_source: name ? "attribution" : null,
            })
            .select("id")
            .single();
          if (newCustErr) throw new Error(`Failed to create customer: ${newCustErr.message}`);
          const newId = newCust.id;
          customerId = newId;
          isNew = true;
          // Update indexes for subsequent rows
          if (email) attrEmailIndex.set(email.trim().toLowerCase(), { id: newId, full_name: name, name_source: "attribution" });
          if (phone) {
            const norm = normalizePhone(phone);
            if (norm) attrPhoneIndex.set(norm, newId);
          }
        }

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
