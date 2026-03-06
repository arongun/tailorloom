import type { SourceType } from "./database";

/** Internal schema key — extends SourceType with attribution sub-types.
 *  Used ONLY for schema detection / mapping. Never written to DB. */
export type SchemaKey = SourceType | "attribution_firsttouch" | "attribution_journeys";

export interface SchemaField {
  key: string;
  label: string;
  type: "text" | "email" | "number" | "currency" | "date" | "timestamp" | "enum";
  required: boolean;
  aliases: string[];
  samplePattern?: RegExp;
  description: string;
  enumValues?: string[];
}

export interface SourceSchema {
  source: SourceType | SchemaKey;
  label: string;
  fields: SchemaField[];
  idField: string;
  emailField: string;
  nameField: string;
  customerIdField?: string;
  phoneField?: string;
}

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  sampleRows: Record<string, string>[];
  totalRows: number;
  errors: ParseError[];
}

export interface ParseError {
  row: number;
  message: string;
}

export type MatchType = "exact" | "alias" | "similarity" | "pattern" | "none";

export interface MappingSuggestion {
  csvHeader: string;
  schemaField: string | null;
  confidence: number;
  matchType: MatchType;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
  value?: string;
  severity?: "error" | "warning";
}

export interface MappedRow {
  [schemaFieldKey: string]: string | number | null;
}

export interface ImportResult {
  importId: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  errors: ValidationError[];
}

export interface PreviewResult {
  mappedRows: MappedRow[];
  validationErrors: ValidationError[];
  totalRows: number;
  validRows: number;
  errorRows: number;
}

// ─── Stitch Preview Types ──────────────────────────────────

export type StitchMatchCategory =
  | "external_id"
  | "email"
  | "email_name_mismatch"
  | "phone"
  | "name_match"
  | "name_conflict"
  | "enrichment"
  | "new"
  | "duplicate"
  | "flagged";

export interface StitchCandidate {
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  matchedBy: "phone" | "name";
  confidence: number;
}

export interface EnrichableField {
  field: "full_name" | "email" | "phone";
  existingValue: null;
  newValue: string;
}

export interface StitchPreviewRow {
  rowIndex: number;
  externalId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  category: StitchMatchCategory;
  existingCustomerId: string | null;
  existingCustomerName: string | null;
  existingCustomerEmail: string | null;
  confidence: number;
  candidates: StitchCandidate[];
  enrichableFields: EnrichableField[];
  rawRow?: Record<string, string>;
  flagReason?: string;
  flagIssues?: Array<{
    severity: "warning" | "error";
    message: string;
    field?: string;
    value?: string;
  }>;
}

export type StitchDecision =
  | { action: "merge"; targetCustomerId: string }
  | { action: "merge_keep_name"; targetCustomerId: string }
  | { action: "merge_update_name"; targetCustomerId: string }
  | { action: "create_new" }
  | { action: "skip" }
  | { action: "accept_enrichment"; targetCustomerId: string };

export type StitchDecisions = Record<number, StitchDecision>;

export interface StitchPreviewSummary {
  confidentMatches: number;
  uncertainMatches: number;
  nameReviewMatches: number;
  newCustomers: number;
  duplicateRows: number;
  enrichments: number;
  flaggedCount: number;
  totalValidRows: number;
}

export interface StitchPreviewResult {
  summary: StitchPreviewSummary;
  uncertainRows: StitchPreviewRow[];
  nameReviewRows: StitchPreviewRow[];
  confidentRows: StitchPreviewRow[];
  newRows: StitchPreviewRow[];
  duplicateRows: StitchPreviewRow[];
  enrichmentRows: StitchPreviewRow[];
  flaggedRows: StitchPreviewRow[];
  warnings: ValidationError[];
}

export interface ImportResultDetailed extends ImportResult {
  matchedByExternalId: number;
  matchedByEmail: number;
  matchedByPhone: number;
  newCustomersCreated: number;
  duplicateRowsSkipped: number;
  userSkippedRows: number;
  conflictsCreated: number;
  enrichedCount: number;
}
