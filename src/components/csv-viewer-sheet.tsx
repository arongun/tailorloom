"use client";

import { useState, useEffect } from "react";
import { Loader2, FileSpreadsheet } from "lucide-react";
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
import { getImportRows } from "@/lib/actions/history";

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

  useEffect(() => {
    if (open && importId) {
      setLoading(true);
      setHeaders([]);
      setRows([]);
      getImportRows(importId)
        .then((data) => {
          setHeaders(data.headers);
          setRows(data.rows);
        })
        .catch(() => {
          setHeaders([]);
          setRows([]);
        })
        .finally(() => setLoading(false));
    }
  }, [open, importId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!max-w-[900px] w-[900px] overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border-muted">
          <SheetTitle className="text-[15px] font-semibold text-text-primary">
            {fileName}
          </SheetTitle>
          <p className="text-[12px] text-text-muted">
            {loading
              ? "Loading..."
              : `${rows.length} ${rows.length === 1 ? "row" : "rows"} · ${headers.length} columns`}
          </p>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 text-text-muted animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-muted mb-4">
              <FileSpreadsheet className="h-6 w-6 text-text-muted" />
            </div>
            <p className="text-[14px] font-medium text-text-secondary mb-1">
              No Data Available
            </p>
            <p className="text-[13px] text-text-muted text-center max-w-sm">
              This import may have been reverted, or rows haven&apos;t been
              imported yet.
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
      </SheetContent>
    </Sheet>
  );
}
