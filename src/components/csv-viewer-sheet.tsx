"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, FileSpreadsheet, ArrowRight, ChevronDown, Download, AlertTriangle, AlertCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getImportRows, getImportMetadata } from "@/lib/actions/history";
import type { ImportError } from "@/lib/types";
import Papa from "papaparse";

interface CsvViewerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importId: string | null;
  fileName: string;
}

export function CsvViewerSheet({
  open,
  onOpenChange,
  importId,
  fileName,
}: CsvViewerSheetProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [columnMapping, setColumnMapping] = useState<Record<string, string> | null>(null);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importWarnings, setImportWarnings] = useState<ImportError[]>([]);

  useEffect(() => {
    if (open && importId) {
      setLoading(true);
      setHeaders([]);
      setRows([]);
      setColumnMapping(null);
      setImportErrors([]);
      setImportWarnings([]);

      const rowsPromise = getImportRows(importId).catch(() => ({ headers: [] as string[], rows: [] as Record<string, string>[] }));
      const metaPromise = getImportMetadata(importId).catch(() => ({ column_mapping: null, errors: null, source: "manual" as const }));

      Promise.all([rowsPromise, metaPromise])
        .then(([rowData, metadata]) => {
          setHeaders(rowData.headers);
          setRows(rowData.rows);
          setColumnMapping(metadata.column_mapping);

          // Split errors by severity (legacy entries without severity default to "error")
          const allErrors = (metadata.errors ?? []) as ImportError[];
          setImportErrors(allErrors.filter((e) => (e.severity ?? "error") === "error"));
          setImportWarnings(allErrors.filter((e) => e.severity === "warning"));
        })
        .finally(() => setLoading(false));
    }
  }, [open, importId]);

  const headerLabels = useMemo(() => {
    if (!columnMapping) return null;
    return new Map(Object.entries(columnMapping));
  }, [columnMapping]);

  const rowStatusMap = useMemo(() => {
    const map = new Map<number, { errors: ImportError[]; warnings: ImportError[] }>();
    for (const err of importErrors) {
      if (!map.has(err.row)) map.set(err.row, { errors: [], warnings: [] });
      map.get(err.row)!.errors.push(err);
    }
    for (const warn of importWarnings) {
      if (!map.has(warn.row)) map.set(warn.row, { errors: [], warnings: [] });
      map.get(warn.row)!.warnings.push(warn);
    }
    return map;
  }, [importErrors, importWarnings]);

  const hasIssues = importErrors.length > 0 || importWarnings.length > 0;

  const handleDownload = () => {
    if (rows.length === 0) return;
    const csv = Papa.unparse(rows, { columns: headers });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!max-w-[900px] w-[900px] p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border-muted shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-[15px] font-semibold text-text-primary">
                {fileName}
              </SheetTitle>
              <p className="text-[12px] text-text-muted mt-0.5">
                {loading
                  ? "Loading..."
                  : `${rows.length} ${rows.length === 1 ? "row" : "rows"} · ${headers.length} columns`}
              </p>
            </div>
            {!loading && rows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1.5"
                onClick={handleDownload}
              >
                <Download className="h-3 w-3" />
                Download CSV
              </Button>
            )}
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 text-text-muted animate-spin" />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Column Mapping */}
            {columnMapping && Object.keys(columnMapping).length > 0 && (
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full px-6 py-3 text-left border-b border-border-muted hover:bg-surface-muted/50 transition-colors group">
                  <ChevronDown className="h-3.5 w-3.5 text-text-muted transition-transform group-data-[state=closed]:-rotate-90" />
                  <span className="text-[12px] font-medium text-text-secondary">
                    Column Mapping
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {Object.keys(columnMapping).length} fields
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 py-3 border-b border-border-muted bg-surface-muted/30">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {Object.entries(columnMapping).map(([csvCol, dbField]) => (
                        <div key={csvCol} className="flex items-center gap-2 text-[12px]">
                          <span className="text-text-secondary truncate max-w-[140px]" title={csvCol}>
                            {csvCol}
                          </span>
                          <ArrowRight className="h-3 w-3 text-text-muted flex-shrink-0" />
                          <span className="text-text-primary font-medium truncate max-w-[140px]" title={dbField}>
                            {dbField}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Errors */}
            {importErrors.length > 0 && (
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full px-6 py-3 text-left border-b border-border-muted hover:bg-surface-muted/50 transition-colors group">
                  <ChevronDown className="h-3.5 w-3.5 text-rose-500 transition-transform group-data-[state=closed]:-rotate-90" />
                  <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                  <span className="text-[12px] font-medium text-rose-700 dark:text-rose-400">
                    Errors
                  </span>
                  <span className="text-[11px] text-rose-500">
                    {importErrors.length}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 py-3 border-b border-border-muted bg-rose-50/50 dark:bg-rose-500/5">
                    <div className="space-y-1">
                      {importErrors.slice(0, 50).map((err, i) => (
                        <p key={i} className="text-[12px] text-rose-700 dark:text-rose-400">
                          <span className="font-medium">Row {err.row}</span>
                          {err.field && <span> · {err.field}</span>}
                          <span> — {err.message}</span>
                        </p>
                      ))}
                      {importErrors.length > 50 && (
                        <p className="text-[11px] text-rose-500 pt-1">
                          ... and {importErrors.length - 50} more
                        </p>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Warnings */}
            {importWarnings.length > 0 && (
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full px-6 py-3 text-left border-b border-border-muted hover:bg-surface-muted/50 transition-colors group">
                  <ChevronDown className="h-3.5 w-3.5 text-amber-500 transition-transform group-data-[state=closed]:-rotate-90" />
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[12px] font-medium text-amber-700 dark:text-amber-400">
                    Warnings
                  </span>
                  <span className="text-[11px] text-amber-500">
                    {importWarnings.length}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 py-3 border-b border-border-muted bg-amber-50/50 dark:bg-amber-500/5">
                    <div className="space-y-1">
                      {importWarnings.slice(0, 50).map((warn, i) => (
                        <p key={i} className="text-[12px] text-amber-700 dark:text-amber-400">
                          <span className="font-medium">Row {warn.row}</span>
                          {warn.field && <span> · {warn.field}</span>}
                          <span> — {warn.message}</span>
                        </p>
                      ))}
                      {importWarnings.length > 50 && (
                        <p className="text-[11px] text-amber-500 pt-1">
                          ... and {importWarnings.length - 50} more
                        </p>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Data Table or Empty State */}
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 px-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-muted mb-4">
                  <FileSpreadsheet className="h-6 w-6 text-text-muted" />
                </div>
                <p className="text-[14px] font-medium text-text-secondary mb-1">
                  No Imported Rows
                </p>
                <p className="text-[13px] text-text-muted text-center max-w-sm">
                  All rows may have had validation errors, or this import was reverted.
                </p>
              </div>
            ) : (
              <TooltipProvider>
                <div
                  className="flex-1 min-h-0 overflow-auto"
                  style={{ "--col-num-w": "50px" } as React.CSSProperties}
                >
                  <table className="w-full caption-bottom text-sm">
                    <TableHeader className="sticky top-0 z-20 bg-surface [&_tr]:hover:bg-transparent">
                      <TableRow>
                        <TableHead className="text-[11px] font-medium text-text-muted w-[--col-num-w] sticky left-0 top-0 bg-surface z-30">
                          #
                        </TableHead>
                        {hasIssues && (
                          <TableHead className="text-[11px] font-medium text-text-muted w-[160px] sticky left-[--col-num-w] bg-surface z-20">
                            Status
                          </TableHead>
                        )}
                        {headers.map((h) => {
                          const mappedField = headerLabels?.get(h);
                          return (
                            <TableHead key={h} className="whitespace-nowrap py-2 bg-surface">
                              {headerLabels ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className={cn(
                                    "text-[11px] font-semibold",
                                    mappedField ? "text-text-primary" : "text-text-muted italic"
                                  )}>
                                    {mappedField ?? "Unmapped"}
                                  </span>
                                  <span className="text-[10px] text-text-muted font-normal">{h}</span>
                                </div>
                              ) : (
                                <span className="text-[11px] font-medium text-text-muted">{h}</span>
                              )}
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, i) => (
                        <TableRow
                          key={i}
                          className={cn(
                            rowStatusMap.get(i + 1)?.errors.length
                              ? "bg-rose-50/40 dark:bg-rose-500/[0.03]"
                              : rowStatusMap.get(i + 1)?.warnings.length
                                ? "bg-amber-50/40 dark:bg-amber-500/[0.03]"
                                : ""
                          )}
                        >
                          <TableCell className="text-[11px] text-text-muted tabular-nums sticky left-0 bg-surface z-10 border-r border-border-muted">
                            {i + 1}
                          </TableCell>
                          {hasIssues && (() => {
                            const status = rowStatusMap.get(i + 1);
                            if (!status) return <TableCell className="sticky left-[--col-num-w] bg-surface z-10 border-r border-border-muted" />;

                            const isError = status.errors.length > 0;
                            const firstIssue = isError ? status.errors[0] : status.warnings[0];
                            const totalCount = status.errors.length + status.warnings.length;
                            const label = `${isError ? "E" : "W"}: ${firstIssue.message}`;

                            return (
                              <TableCell className={cn(
                                "text-[11px] sticky left-[--col-num-w] z-10 border-r border-border-muted max-w-[160px]",
                                isError
                                  ? "bg-rose-50/80 dark:bg-rose-500/8 text-rose-600 dark:text-rose-400"
                                  : "bg-amber-50/80 dark:bg-amber-500/8 text-amber-600 dark:text-amber-400"
                              )}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="flex items-center gap-1 truncate cursor-help text-left w-full focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">
                                      {isError
                                        ? <AlertCircle className="h-3 w-3 shrink-0" />
                                        : <AlertTriangle className="h-3 w-3 shrink-0" />}
                                      <span className="truncate">{label}</span>
                                      {totalCount > 1 && (
                                        <span className="text-[10px] opacity-70 shrink-0">+{totalCount - 1}</span>
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[300px]">
                                    <div className="space-y-1 text-[11px]">
                                      {status.errors.map((e, j) => (
                                        <p key={`e${j}`} className="text-rose-600 dark:text-rose-400">
                                          {e.field && <span className="font-medium">{e.field}: </span>}
                                          {e.message}
                                        </p>
                                      ))}
                                      {status.warnings.map((w, j) => (
                                        <p key={`w${j}`} className="text-amber-600 dark:text-amber-400">
                                          {w.field && <span className="font-medium">{w.field}: </span>}
                                          {w.message}
                                        </p>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                            );
                          })()}
                          {headers.map((h) => (
                            <TableCell
                              key={h}
                              className="text-[12px] text-text-secondary whitespace-nowrap max-w-[300px] truncate"
                            >
                              {row[h] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </table>
                </div>
              </TooltipProvider>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
