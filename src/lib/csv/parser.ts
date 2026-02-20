import Papa from "papaparse";
import type { ParseResult, ParseError } from "@/lib/types";

const SAMPLE_SIZE = 5;

export function parseCSVContent(content: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header: string) => header.trim(),
  });

  const errors: ParseError[] = result.errors.map((e) => ({
    row: e.row ?? 0,
    message: e.message,
  }));

  const headers = result.meta.fields ?? [];
  const rows = result.data;
  const sampleRows = rows.slice(0, SAMPLE_SIZE);

  return {
    headers,
    rows,
    sampleRows,
    totalRows: rows.length,
    errors,
  };
}
