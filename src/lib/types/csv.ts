import type { SourceType } from "./database";

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
  source: SourceType;
  label: string;
  fields: SchemaField[];
  idField: string;
  emailField: string;
  nameField: string;
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
