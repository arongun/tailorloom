import type { SourceSchema, ValidationError } from "@/lib/types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Detect common TLD/domain typos that indicate a mistyped email.
 * Does NOT auto-correct — just detects for stripping + warning.
 */
const SUSPICIOUS_PATTERNS = [
  /\.con$/i,    // .com typo
  /\.cmo$/i,    // .com typo
  /\.ocm$/i,    // .com typo
  /\.cm$/i,     // .com typo
  /\.nte$/i,    // .net typo
  /\.nrt$/i,    // .net typo
  /\.ogr$/i,    // .org typo
  /\.orh$/i,    // .org typo
  /\.rog$/i,    // .org typo
  /@gmal\./i,   // gmail typo
  /@gmial\./i,  // gmail typo
  /@gmaul\./i,  // gmail typo
  /@gmali\./i,  // gmail typo
  /@gnail\./i,  // gmail typo
  /@gamil\./i,  // gmail typo
  /@yaho\./i,   // yahoo typo
  /@yahooo\./i, // yahoo typo
  /@hotmal\./i, // hotmail typo
  /@hotmial\./i,// hotmail typo
  /@outlok\./i, // outlook typo
];

function isSuspiciousTLD(email: string): boolean {
  return SUSPICIOUS_PATTERNS.some((p) => p.test(email));
}

/**
 * Parse a currency string into a number. Strips $, commas, spaces.
 */
export function parseCurrency(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse a numeric string into a number.
 */
export function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Try to parse a date/timestamp string. Returns ISO string or null.
 */
export function parseTimestamp(value: string): string | null {
  // Try direct Date parsing
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString();

  // Try common formats: MM/DD/YYYY, DD/MM/YYYY etc.
  // For ambiguous dates, prefer month-first (US convention)
  const parts = value.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (parts) {
    const [, a, b, yearStr] = parts;
    const year =
      yearStr.length === 2
        ? 2000 + parseInt(yearStr)
        : parseInt(yearStr);
    // Try month/day/year first
    const mdDate = new Date(year, parseInt(a) - 1, parseInt(b));
    if (!isNaN(mdDate.getTime())) return mdDate.toISOString();
  }

  return null;
}

/**
 * Validate a single mapped row against the schema.
 * Returns errors (hard failures that skip the row) and warnings (stripped fields, row still imports).
 */
export function validateMappedRow(
  row: Record<string, string | null>,
  schema: SourceSchema,
  rowIndex: number
): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  for (const field of schema.fields) {
    const value = row[field.key]?.trim() ?? "";

    // Required check
    if (field.required && !value) {
      errors.push({
        row: rowIndex,
        field: field.key,
        message: `Required field "${field.label}" is empty`,
        value: "",
      });
      continue;
    }

    // Skip empty optional fields
    if (!value) continue;

    // Type-specific validation
    switch (field.type) {
      case "email": {
        const badFormat = !EMAIL_REGEX.test(value);
        const suspiciousTld = !badFormat && isSuspiciousTLD(value);

        if (badFormat || suspiciousTld) {
          if (field.required) {
            // Required email with bad format is a hard error
            errors.push({
              row: rowIndex,
              field: field.key,
              message: badFormat
                ? `Invalid email format: "${value}"`
                : `Suspicious email (possible typo): "${value}"`,
              value,
            });
          } else {
            // Optional email — strip to null and warn
            row[field.key] = null;
            warnings.push({
              row: rowIndex,
              field: field.key,
              message: badFormat
                ? `Invalid email stripped: "${value}"`
                : `Suspicious email stripped (possible typo): "${value}"`,
              value,
              severity: "warning",
            });
          }
        }
        break;
      }

      case "number":
        if (parseNumber(value) === null) {
          errors.push({
            row: rowIndex,
            field: field.key,
            message: `Invalid number: "${value}"`,
            value,
          });
        }
        break;

      case "currency":
        if (parseCurrency(value) === null) {
          errors.push({
            row: rowIndex,
            field: field.key,
            message: `Invalid currency amount: "${value}"`,
            value,
          });
        }
        break;

      case "date":
      case "timestamp":
        if (parseTimestamp(value) === null) {
          errors.push({
            row: rowIndex,
            field: field.key,
            message: `Invalid date/time: "${value}"`,
            value,
          });
        }
        break;

      case "enum":
        if (field.enumValues && !field.enumValues.includes(value.toLowerCase())) {
          errors.push({
            row: rowIndex,
            field: field.key,
            message: `Invalid value "${value}". Expected: ${field.enumValues.join(", ")}`,
            value,
          });
        }
        break;
    }
  }

  return { errors, warnings };
}

/**
 * Apply a column mapping to a raw CSV row, producing a mapped row
 * with schema field keys as keys.
 */
export function applyMapping(
  rawRow: Record<string, string>,
  mapping: Record<string, string>
): Record<string, string | null> {
  const mapped: Record<string, string | null> = {};

  for (const [csvHeader, schemaField] of Object.entries(mapping)) {
    const value = rawRow[csvHeader]?.trim() ?? null;
    mapped[schemaField] = value || null;
  }

  return mapped;
}
