"use client";

import { useState, useEffect, useCallback } from "react";
import {
  History,
  CreditCard,
  Calendar,
  Ticket,
  ShoppingBag,
  Globe,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getImportHistory,
  revertImport,
  type ImportHistoryRow,
} from "@/lib/actions/history";
import { CsvViewerSheet } from "@/components/csv-viewer-sheet";
import type { SourceType } from "@/lib/types";
import { toast } from "sonner";

const PAGE_SIZE = 20;

const SOURCE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  stripe: {
    label: "Stripe",
    icon: CreditCard,
    color: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-500/10",
  },
  calendly: {
    label: "Calendly",
    icon: Calendar,
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-500/10",
  },
  passline: {
    label: "PassLine",
    icon: Ticket,
    color: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/10",
  },
  pos: {
    label: "POS",
    icon: ShoppingBag,
    color: "text-orange-700 dark:text-orange-400",
    bg: "bg-orange-100 dark:bg-orange-500/10",
  },
  wetravel: {
    label: "WeTravel",
    icon: Globe,
    color: "text-cyan-700 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/10",
  },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  completed: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/10 dark:border-emerald-500/20",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-50 text-blue-700 hover:bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/10 dark:border-blue-500/20",
  },
  failed: {
    label: "Failed",
    className: "bg-rose-50 text-rose-700 hover:bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:border-rose-500/20",
  },
  pending: {
    label: "Pending",
    className: "bg-surface-muted text-text-secondary hover:bg-surface-muted border-border-default",
  },
  skipped: {
    label: "Skipped",
    className: "bg-amber-50 text-amber-700 hover:bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/10 dark:border-amber-500/20",
  },
  reverted: {
    label: "Reverted",
    className: "bg-surface-muted text-text-muted hover:bg-surface-muted border-border-default",
  },
};

export default function ImportsPage() {
  const [imports, setImports] = useState<ImportHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [openDialogId, setOpenDialogId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewingImportId, setViewingImportId] = useState<string | null>(null);
  const [viewingFileName, setViewingFileName] = useState("");

  const fetchImports = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getImportHistory({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        source:
          sourceFilter !== "all"
            ? (sourceFilter as SourceType)
            : undefined,
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

  const handleRevert = async (importId: string) => {
    setRevertingId(importId);
    try {
      await revertImport(importId);
      toast.success("Import reverted — all records removed");
      fetchImports();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revert import"
      );
    } finally {
      setRevertingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          Import History
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          View past CSV imports and their status
        </p>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-3 animate-fade-in-up stagger-2">
        <Select
          value={sourceFilter}
          onValueChange={(v) => {
            setSourceFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[160px] text-[13px]">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="stripe">Stripe</SelectItem>
            <SelectItem value="calendly">Calendly</SelectItem>
            <SelectItem value="passline">PassLine</SelectItem>
            <SelectItem value="pos">POS</SelectItem>
            <SelectItem value="wetravel">WeTravel</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[12px] text-text-muted ml-auto">
          {total} {total === 1 ? "import" : "imports"}
        </span>
      </div>

      {/* Table */}
      <Card className="border-border-default shadow-none animate-fade-in-up stagger-3">
        {loading ? (
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 text-text-muted animate-spin" />
          </CardContent>
        ) : imports.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 px-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-muted mb-4">
              <History className="h-6 w-6 text-text-muted" />
            </div>
            <p className="text-[14px] font-medium text-text-secondary mb-1">
              No Imports Yet
            </p>
            <p className="text-[13px] text-text-muted text-center max-w-md">
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
                  <TableHead className="text-[12px] text-right">
                    Total
                  </TableHead>
                  <TableHead className="text-[12px] text-right">
                    Imported
                  </TableHead>
                  <TableHead className="text-[12px] text-right">
                    Skipped
                  </TableHead>
                  <TableHead className="text-[12px] text-right">
                    Errors
                  </TableHead>
                  <TableHead className="text-[12px]">Date</TableHead>
                  <TableHead className="text-[12px] w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => {
                  const src = SOURCE_CONFIG[imp.source];
                  const status =
                    STATUS_CONFIG[imp.status] ?? STATUS_CONFIG.pending;
                  const SrcIcon = src?.icon ?? History;
                  const canRevert =
                    imp.status === "completed" && imp.imported_rows > 0;
                  const isReverting = revertingId === imp.id;

                  return (
                    <TableRow
                      key={imp.id}
                      className={
                        imp.status === "reverted" ? "opacity-50" : ""
                      }
                    >
                      <TableCell className="text-[13px] font-medium text-text-primary max-w-[200px] truncate">
                        {imp.file_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded ${src?.bg ?? "bg-surface-muted"}`}
                          >
                            <SrcIcon
                              className={`h-3 w-3 ${src?.color ?? "text-text-muted"}`}
                            />
                          </div>
                          <span className="text-[12px] text-text-secondary">
                            {src?.label ?? imp.source}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-medium ${status.className}`}
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[13px] text-right tabular-nums text-text-secondary">
                        {imp.total_rows}
                      </TableCell>
                      <TableCell className="text-[13px] text-right tabular-nums text-emerald-600">
                        {imp.imported_rows}
                      </TableCell>
                      <TableCell className="text-[13px] text-right tabular-nums text-text-muted">
                        {imp.skipped_rows}
                      </TableCell>
                      <TableCell
                        className={`text-[13px] text-right tabular-nums ${imp.error_rows > 0 ? "text-rose-600" : "text-text-muted"}`}
                      >
                        {imp.error_rows}
                      </TableCell>
                      <TableCell className="text-[12px] text-text-muted">
                        {formatDate(
                          imp.completed_at ??
                            imp.started_at ??
                            imp.created_at
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {imp.status !== "pending" &&
                            imp.status !== "processing" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-text-muted hover:text-text-primary"
                                onClick={() => {
                                  setViewingImportId(imp.id);
                                  setViewingFileName(imp.file_name);
                                  setViewerOpen(true);
                                }}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                View
                              </Button>
                            )}
                          {canRevert && (
                            <AlertDialog
                              open={openDialogId === imp.id}
                              onOpenChange={(open) => {
                                setOpenDialogId(open ? imp.id : null);
                                if (!open) setConfirmText("");
                              }}
                            >
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-text-muted hover:text-rose-600"
                                  disabled={isReverting}
                                >
                                  {isReverting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <Undo2 className="h-3 w-3 mr-1" />
                                      Revert
                                    </>
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Revert this import?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will delete all {imp.imported_rows}{" "}
                                    records created by{" "}
                                    <span className="font-medium">
                                      {imp.file_name}
                                    </span>
                                    . Customers with no remaining data from
                                    other imports will also be removed. This
                                    cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="mt-2">
                                  <label className="text-[13px] text-text-secondary">
                                    Type <span className="font-semibold">revert</span> to confirm
                                  </label>
                                  <Input
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    placeholder="revert"
                                    className="mt-1.5 text-[13px]"
                                    autoComplete="off"
                                  />
                                </div>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <Button
                                    disabled={confirmText !== "revert"}
                                    onClick={() => {
                                      setOpenDialogId(null);
                                      setConfirmText("");
                                      handleRevert(imp.id);
                                    }}
                                    className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                                  >
                                    Revert import
                                  </Button>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border-muted">
                <span className="text-[12px] text-text-muted">
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

      {/* CSV Viewer Sheet */}
      <CsvViewerSheet
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        importId={viewingImportId}
        fileName={viewingFileName}
      />
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
