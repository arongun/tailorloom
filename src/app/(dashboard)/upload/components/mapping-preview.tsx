"use client";

import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PreviewResult, SourceSchema } from "@/lib/types";

interface MappingPreviewProps {
  preview: PreviewResult;
  schema: SourceSchema;
}

export function MappingPreview({ preview, schema }: MappingPreviewProps) {
  const { mappedRows, validationErrors, totalRows, validRows, errorRows } =
    preview;

  // Only show mapped fields that have data
  const displayFields = schema.fields.filter((f) =>
    mappedRows.some((row) => row[f.key])
  );

  // Group errors by row
  const errorsByRow = new Map<number, string[]>();
  for (const err of validationErrors) {
    const existing = errorsByRow.get(err.row) ?? [];
    existing.push(err.message);
    errorsByRow.set(err.row, existing);
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-50">
              <span className="text-[13px] font-semibold text-slate-700">
                {totalRows}
              </span>
            </div>
            <p className="text-[12px] text-slate-500">Total rows</p>
          </div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-emerald-700">
                {validRows}
              </p>
              <p className="text-[11px] text-emerald-600">Valid</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-100">
              <XCircle className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-rose-700">
                {errorRows}
              </p>
              <p className="text-[11px] text-rose-600">Errors</p>
            </div>
          </div>
        </div>
      </div>

      {/* Preview table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3">
          <p className="text-[12px] font-medium text-slate-500">
            Showing first {mappedRows.length} of {totalRows} rows
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-10">
                  #
                </TableHead>
                {displayFields.map((field) => (
                  <TableHead
                    key={field.key}
                    className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap"
                  >
                    {field.label}
                    {field.required && (
                      <span className="ml-0.5 text-rose-400">*</span>
                    )}
                  </TableHead>
                ))}
                <TableHead className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappedRows.map((row, i) => {
                const rowErrors = errorsByRow.get(i + 1);
                const hasError = !!rowErrors;

                return (
                  <TableRow
                    key={i}
                    className={
                      hasError
                        ? "bg-rose-50/30 border-slate-50"
                        : "border-slate-50"
                    }
                  >
                    <TableCell className="text-[12px] text-slate-400 font-mono">
                      {i + 1}
                    </TableCell>
                    {displayFields.map((field) => (
                      <TableCell
                        key={field.key}
                        className="text-[12px] text-slate-700 max-w-[200px] truncate"
                      >
                        {row[field.key] ?? (
                          <span className="text-slate-300">—</span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      {hasError ? (
                        <Badge
                          variant="outline"
                          className="border-rose-200 bg-rose-50 text-rose-700 text-[10px]"
                        >
                          Error
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]"
                        >
                          Valid
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/30 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-rose-100 px-5 py-3">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <p className="text-[12px] font-medium text-rose-700">
              Validation errors ({validationErrors.length})
            </p>
          </div>
          <div className="max-h-[200px] overflow-y-auto divide-y divide-rose-100">
            {validationErrors.slice(0, 20).map((err, i) => (
              <div key={i} className="px-5 py-2.5">
                <p className="text-[12px] text-rose-700">
                  <span className="font-mono text-rose-400">Row {err.row}</span>
                  {err.field && (
                    <span className="text-rose-400"> &middot; {err.field}</span>
                  )}
                  <span className="mx-1.5 text-rose-300">—</span>
                  {err.message}
                </p>
              </div>
            ))}
            {validationErrors.length > 20 && (
              <div className="px-5 py-2.5">
                <p className="text-[11px] text-rose-400">
                  + {validationErrors.length - 20} more errors
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
