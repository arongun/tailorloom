"use client";

import { useState, useEffect, useCallback } from "react";
import {
  History,
  CreditCard,
  Calendar,
  Ticket,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  getImportHistory,
  type ImportHistoryRow,
} from "@/lib/actions/history";
import type { SourceType } from "@/lib/types";

const PAGE_SIZE = 20;

const SOURCE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  stripe: {
    label: "Stripe",
    icon: CreditCard,
    color: "text-violet-700",
    bg: "bg-violet-100",
  },
  calendly: {
    label: "Calendly",
    icon: Calendar,
    color: "text-blue-700",
    bg: "bg-blue-100",
  },
  passline: {
    label: "PassLine",
    icon: Ticket,
    color: "text-emerald-700",
    bg: "bg-emerald-100",
  },
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  completed: { label: "Completed", variant: "default" },
  processing: { label: "Processing", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  pending: { label: "Pending", variant: "outline" },
};

export default function ImportsPage() {
  const [imports, setImports] = useState<ImportHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const fetchImports = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getImportHistory({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        source: sourceFilter !== "all" ? (sourceFilter as SourceType) : undefined,
      });
      setImports(result.imports);
      setTotal(result.total);
    } catch {
      // Silently fail — empty state will show
    } finally {
      setLoading(false);
    }
  }, [page, sourceFilter]);

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
          Import History
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          View past CSV imports and their status
        </p>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-3 animate-fade-in-up stagger-2">
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] text-[13px]">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="stripe">Stripe</SelectItem>
            <SelectItem value="calendly">Calendly</SelectItem>
            <SelectItem value="passline">PassLine</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[12px] text-slate-400 ml-auto">
          {total} {total === 1 ? "import" : "imports"}
        </span>
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-none animate-fade-in-up stagger-3">
        {loading ? (
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
          </CardContent>
        ) : imports.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 px-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 mb-4">
              <History className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-[14px] font-medium text-slate-700 mb-1">
              No Imports Yet
            </p>
            <p className="text-[13px] text-slate-400 text-center max-w-md">
              Import history will appear here once you upload CSV files.
            </p>
          </CardContent>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[12px]">File</TableHead>
                  <TableHead className="text-[12px]">Source</TableHead>
                  <TableHead className="text-[12px]">Status</TableHead>
                  <TableHead className="text-[12px] text-right">Total</TableHead>
                  <TableHead className="text-[12px] text-right">Imported</TableHead>
                  <TableHead className="text-[12px] text-right">Skipped</TableHead>
                  <TableHead className="text-[12px] text-right">Errors</TableHead>
                  <TableHead className="text-[12px]">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => {
                  const src = SOURCE_CONFIG[imp.source];
                  const status = STATUS_CONFIG[imp.status] ?? STATUS_CONFIG.pending;
                  const SrcIcon = src?.icon ?? History;

                  return (
                    <TableRow key={imp.id}>
                      <TableCell className="text-[13px] font-medium text-slate-800 max-w-[200px] truncate">
                        {imp.file_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className={`flex h-5 w-5 items-center justify-center rounded ${src?.bg ?? "bg-slate-100"}`}>
                            <SrcIcon className={`h-3 w-3 ${src?.color ?? "text-slate-500"}`} />
                          </div>
                          <span className="text-[12px] text-slate-600">
                            {src?.label ?? imp.source}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="text-[11px]">
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[13px] text-right tabular-nums text-slate-700">
                        {imp.total_rows}
                      </TableCell>
                      <TableCell className="text-[13px] text-right tabular-nums text-emerald-600">
                        {imp.imported_rows}
                      </TableCell>
                      <TableCell className="text-[13px] text-right tabular-nums text-slate-500">
                        {imp.skipped_rows}
                      </TableCell>
                      <TableCell className={`text-[13px] text-right tabular-nums ${imp.error_rows > 0 ? "text-rose-600" : "text-slate-500"}`}>
                        {imp.error_rows}
                      </TableCell>
                      <TableCell className="text-[12px] text-slate-500">
                        {formatDate(imp.completed_at ?? imp.started_at ?? imp.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <span className="text-[12px] text-slate-400">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
