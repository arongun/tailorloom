"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Merge,
  X,
  CheckCircle2,
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
import { toast } from "sonner";
import {
  getStitchingConflicts,
  resolveConflict,
  type ConflictWithCustomers,
} from "@/lib/actions/history";
import type { ConflictStatus } from "@/lib/types";

const PAGE_SIZE = 20;

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pending", variant: "outline" },
  merged: { label: "Merged", variant: "default" },
  dismissed: { label: "Dismissed", variant: "secondary" },
  split: { label: "Split", variant: "secondary" },
};

export default function ConflictsPage() {
  const [conflicts, setConflicts] = useState<ConflictWithCustomers[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getStitchingConflicts({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        status: statusFilter as ConflictStatus | "all",
      });
      setConflicts(result.conflicts);
      setTotal(result.total);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

  const handleResolve = async (
    conflictId: string,
    resolution: "merged" | "dismissed"
  ) => {
    setResolving(conflictId);
    try {
      await resolveConflict(conflictId, resolution);
      toast.success(
        resolution === "merged"
          ? "Customers merged successfully"
          : "Conflict dismissed"
      );
      fetchConflicts();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to resolve conflict"
      );
    } finally {
      setResolving(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          Identity Conflicts
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Review flagged customer identity matches that need manual confirmation
        </p>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-3 animate-fade-in-up stagger-2">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[160px] text-[13px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="merged">Merged</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[12px] text-text-muted ml-auto">
          {total} {total === 1 ? "conflict" : "conflicts"}
        </span>
      </div>

      {/* Table */}
      <Card className="border-border-default shadow-none animate-fade-in-up stagger-3">
        {loading ? (
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 text-text-muted animate-spin" />
          </CardContent>
        ) : conflicts.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 px-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <p className="text-[14px] font-medium text-text-secondary mb-1">
              No Conflicts
            </p>
            <p className="text-[13px] text-text-muted text-center max-w-md">
              Identity conflicts will appear here when the system detects
              potential customer matches that need your review.
            </p>
          </CardContent>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[12px]">Customer A</TableHead>
                  <TableHead className="text-[12px]">Customer B</TableHead>
                  <TableHead className="text-[12px]">Match Field</TableHead>
                  <TableHead className="text-[12px]">Confidence</TableHead>
                  <TableHead className="text-[12px]">Status</TableHead>
                  <TableHead className="text-[12px]">Date</TableHead>
                  <TableHead className="text-[12px] text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflicts.map((conflict) => {
                  const status =
                    STATUS_CONFIG[conflict.status] ?? STATUS_CONFIG.pending;
                  const isPending = conflict.status === "pending";
                  const isResolvingThis = resolving === conflict.id;

                  return (
                    <TableRow key={conflict.id}>
                      <TableCell>
                        <div>
                          <p className="text-[13px] font-medium text-text-primary truncate max-w-[180px]">
                            {conflict.customer_a_name ?? "Unknown"}
                          </p>
                          <p className="text-[11px] text-text-muted truncate max-w-[180px]">
                            {conflict.customer_a_email ?? "No email"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-[13px] font-medium text-text-primary truncate max-w-[180px]">
                            {conflict.customer_b_name ?? "Unknown"}
                          </p>
                          <p className="text-[11px] text-text-muted truncate max-w-[180px]">
                            {conflict.customer_b_email ?? "No email"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {conflict.match_field}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ConfidencePill value={conflict.confidence} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={status.variant}
                          className="text-[11px]"
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[12px] text-text-muted">
                        {formatDate(conflict.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isPending && (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              disabled={isResolvingThis}
                              onClick={() =>
                                handleResolve(conflict.id, "merged")
                              }
                            >
                              {isResolvingThis ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Merge className="mr-1 h-3 w-3" />
                                  Merge
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] text-text-muted hover:text-text-secondary"
                              disabled={isResolvingThis}
                              onClick={() =>
                                handleResolve(conflict.id, "dismissed")
                              }
                            >
                              <X className="mr-1 h-3 w-3" />
                              Dismiss
                            </Button>
                          </div>
                        )}
                        {conflict.status === "merged" && (
                          <span className="text-[11px] text-emerald-600 flex items-center justify-end gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Merged
                          </span>
                        )}
                        {conflict.status === "dismissed" && (
                          <span className="text-[11px] text-text-muted">
                            Dismissed
                          </span>
                        )}
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
    </div>
  );
}

function ConfidencePill({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[12px] text-text-muted">&mdash;</span>;

  const pct = Math.round(value * 100);
  const color =
    pct >= 80
      ? "text-emerald-700 bg-emerald-50"
      : pct >= 50
        ? "text-amber-700 bg-amber-50"
        : "text-rose-700 bg-rose-50";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}
    >
      {pct}%
    </span>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
