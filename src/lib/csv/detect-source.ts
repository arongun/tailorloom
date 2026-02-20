import { SCHEMAS } from "./schemas";
import { generateMappingSuggestions } from "./heuristic-mapper";
import type { SourceType } from "@/lib/types";

export interface DetectionResult {
  source: SourceType;
  confidence: number;
  mappedCount: number;
  requiredMapped: number;
  requiredTotal: number;
}

/**
 * Auto-detect the CSV source type by running the heuristic mapper against
 * all schemas and picking the best fit.
 *
 * Returns results sorted by confidence (best first).
 * If the top result's confidence is >= 0.5 AND it has all required fields
 * mapped, it's considered a strong detection.
 */
export function detectSource(
  headers: string[],
  sampleRows: Record<string, string>[]
): DetectionResult[] {
  const results: DetectionResult[] = [];

  for (const [key, schema] of Object.entries(SCHEMAS)) {
    const suggestions = generateMappingSuggestions(headers, schema, sampleRows);

    // Count mapped fields and their average confidence
    const mapped = suggestions.filter((s) => s.schemaField !== null);
    const avgConfidence =
      mapped.length > 0
        ? mapped.reduce((sum, s) => sum + s.confidence, 0) / mapped.length
        : 0;

    // Count required fields that are mapped
    const requiredFields = schema.fields.filter((f) => f.required);
    const requiredMapped = requiredFields.filter((f) =>
      mapped.some((s) => s.schemaField === f.key)
    ).length;

    // Score: weighted combination of average confidence and coverage
    const coverage = mapped.length / schema.fields.length;
    const requiredCoverage =
      requiredFields.length > 0
        ? requiredMapped / requiredFields.length
        : 1;

    // Strong weight on required field coverage
    const confidence =
      avgConfidence * 0.4 + coverage * 0.2 + requiredCoverage * 0.4;

    results.push({
      source: key as SourceType,
      confidence,
      mappedCount: mapped.length,
      requiredMapped,
      requiredTotal: requiredFields.length,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Returns true if the detection is confident enough to skip the source picker.
 * Requires: confidence >= 0.5, all required fields mapped, and a clear gap
 * between the top result and the runner-up (>= 0.15).
 */
export function isConfidentDetection(results: DetectionResult[]): boolean {
  if (results.length === 0) return false;

  const top = results[0];
  const runnerUp = results[1];

  // Must have decent confidence
  if (top.confidence < 0.5) return false;

  // Must have all required fields mapped
  if (top.requiredMapped < top.requiredTotal) return false;

  // Must be clearly better than the next best
  if (runnerUp && top.confidence - runnerUp.confidence < 0.15) return false;

  return true;
}
