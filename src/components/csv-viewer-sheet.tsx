"use client";

import { useState, useEffect } from "react";
import { Loader2, FileSpreadsheet, ArrowRight, ChevronDown, Download, AlertTriangle, AlertCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
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
import { Button } from "@/components/ui/button";
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
      <SheetContent className="!max-w-[900px] w-[900px] overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border-muted">
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
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 text-text-muted animate-spin" />
          </div>
        ) : (
          <>
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] font-medium text-text-muted w-[50px] sticky left-0 bg-surface z-10">
                        #
                      </TableHead>
                      {headers.map((h) => (
                        <TableHead
                          key={h}
                          className="text-[11px] font-medium text-text-muted whitespace-nowrap"
                        >
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-[11px] text-text-muted tabular-nums sticky left-0 bg-surface z-10 border-r border-border-muted">
                          {i + 1}
                        </TableCell>
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
                </Table>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
