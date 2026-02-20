import type { SourceSchema, MappingSuggestion, MatchType } from "@/lib/types";

/**
 * Normalize a header string for comparison:
 * lowercase, strip non-alphanumeric (keep spaces), collapse whitespace
 */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dice coefficient — bigram similarity between two strings.
 * Returns 0-1, where 1 = identical.
 */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.slice(i, i + 2);
    bigramsA.set(bigram, (bigramsA.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.slice(i, i + 2);
    const count = bigramsA.get(bigram);
    if (count && count > 0) {
      bigramsA.set(bigram, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

/**
 * Check if sample data matches a field's pattern regex.
 */
function checkSamplePattern(
  sampleRows: Record<string, string>[],
  csvHeader: string,
  pattern: RegExp
): number {
  if (sampleRows.length === 0) return 0;

  let matches = 0;
  let total = 0;

  for (const row of sampleRows) {
    const val = row[csvHeader]?.trim();
    if (!val) continue;
    total++;
    if (pattern.test(val)) matches++;
  }

  if (total === 0) return 0;
  return (matches / total) * 0.85; // cap at 0.85 for pattern-only matches
}

/**
 * Generate mapping suggestions for CSV headers against a source schema.
 * Uses a cascade: exact match → alias → similarity → sample pattern.
 */
export function generateMappingSuggestions(
  csvHeaders: string[],
  schema: SourceSchema,
  sampleRows: Record<string, string>[]
): MappingSuggestion[] {
  const usedFields = new Set<string>();
  const suggestions: MappingSuggestion[] = [];

  // Sort schema fields: required first, then by field order
  const sortedFields = [...schema.fields].sort(
    (a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0)
  );

  // First pass: find best match for each CSV header
  const headerScores: Map<
    string,
    { field: string; confidence: number; matchType: MatchType }
  > = new Map();

  for (const csvHeader of csvHeaders) {
    const normalized = normalizeHeader(csvHeader);
    let bestMatch: {
      field: string;
      confidence: number;
      matchType: MatchType;
    } | null = null;

    for (const field of sortedFields) {
      const fieldNormalized = normalizeHeader(field.key);
      const labelNormalized = normalizeHeader(field.label);

      // 1. Exact match against key or label
      if (normalized === fieldNormalized || normalized === labelNormalized) {
        if (!bestMatch || bestMatch.confidence < 1.0) {
          bestMatch = { field: field.key, confidence: 1.0, matchType: "exact" };
        }
        continue;
      }

      // 2. Alias match
      const aliasMatch = field.aliases.some(
        (alias) => normalizeHeader(alias) === normalized
      );
      if (aliasMatch) {
        if (!bestMatch || bestMatch.confidence < 0.95) {
          bestMatch = {
            field: field.key,
            confidence: 0.95,
            matchType: "alias",
          };
        }
        continue;
      }

      // 3. Dice coefficient similarity
      const simKey = diceCoefficient(normalized, fieldNormalized);
      const simLabel = diceCoefficient(normalized, labelNormalized);
      const simAliases = field.aliases.map((a) =>
        diceCoefficient(normalized, normalizeHeader(a))
      );
      const maxSim = Math.max(simKey, simLabel, ...simAliases);

      if (maxSim > 0.6) {
        const conf = Math.min(maxSim, 0.9); // cap similarity at 0.9
        if (!bestMatch || bestMatch.confidence < conf) {
          bestMatch = {
            field: field.key,
            confidence: conf,
            matchType: "similarity",
          };
        }
      }

      // 4. Sample data pattern matching
      if (field.samplePattern) {
        const patternConf = checkSamplePattern(
          sampleRows,
          csvHeader,
          field.samplePattern
        );
        if (patternConf > 0.3) {
          if (!bestMatch || bestMatch.confidence < patternConf) {
            bestMatch = {
              field: field.key,
              confidence: patternConf,
              matchType: "pattern",
            };
          }
        }
      }
    }

    if (bestMatch) {
      headerScores.set(csvHeader, bestMatch);
    }
  }

  // Second pass: resolve conflicts (multiple headers → same field)
  // Keep the highest confidence match
  const fieldToHeaders = new Map<
    string,
    { csvHeader: string; confidence: number; matchType: MatchType }[]
  >();

  for (const [csvHeader, match] of headerScores) {
    const existing = fieldToHeaders.get(match.field) ?? [];
    existing.push({
      csvHeader,
      confidence: match.confidence,
      matchType: match.matchType,
    });
    fieldToHeaders.set(match.field, existing);
  }

  for (const [field, matches] of fieldToHeaders) {
    if (matches.length > 1) {
      // Keep highest confidence, unmap others
      matches.sort((a, b) => b.confidence - a.confidence);
      for (let i = 1; i < matches.length; i++) {
        headerScores.delete(matches[i].csvHeader);
      }
    }
    usedFields.add(field);
    // Only record the winner
    const winner = matches[0];
    headerScores.set(winner.csvHeader, {
      field,
      confidence: winner.confidence,
      matchType: winner.matchType,
    });
  }

  // Build final suggestions
  for (const csvHeader of csvHeaders) {
    const match = headerScores.get(csvHeader);
    if (match) {
      suggestions.push({
        csvHeader,
        schemaField: match.field,
        confidence: match.confidence,
        matchType: match.matchType,
      });
    } else {
      suggestions.push({
        csvHeader,
        schemaField: null,
        confidence: 0,
        matchType: "none",
      });
    }
  }

  return suggestions;
}

/**
 * Convert mapping suggestions to a simple header→field mapping object.
 */
export function suggestionsToMapping(
  suggestions: MappingSuggestion[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const s of suggestions) {
    if (s.schemaField) {
      mapping[s.csvHeader] = s.schemaField;
    }
  }
  return mapping;
}
