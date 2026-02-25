"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { Card } from "@/components/ui/card";
import { CustomerDetailSheet } from "@/components/customer-detail-sheet";
import type { CustomerRow } from "@/lib/actions/dashboard";

type SortKey = "full_name" | "email" | "phone" | "totalRevenue" | "purchaseCount" | "lastActivityDate" | "status" | "segment" | "sources";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = { Active: 0, "At Risk": 1, Churned: 2 };
const SEGMENT_ORDER: Record<string, number> = { "High Value": 0, Regular: 1, "Low Value": 2 };

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  stripe: { label: "Stripe", color: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400" },
  calendly: { label: "Calendly", color: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" },
  passline: { label: "PassLine", color: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400" },
  pos: { label: "POS", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  wetravel: { label: "WeTravel", color: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400" },
  manual: { label: "Manual", color: "bg-surface-muted text-text-secondary" },
};

interface CustomersClientProps {
  customers: CustomerRow[];
}

export function CustomersClient({ customers }: CustomersClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("totalRevenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sheetCustomerId, setSheetCustomerId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Auto-open sheet if ?customer=<id> is in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const customerId = params.get("customer");
    if (customerId) {
      setSheetCustomerId(customerId);
      setSheetOpen(true);
      // Clean up the URL without triggering a navigation
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const filtered = useMemo(() => {
    let result = [...customers];

    if (search) {
      const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter((c) => {
        const name = (c.full_name ?? "").toLowerCase();
        const email = (c.email ?? "").toLowerCase();
        const phone = (c.phone ?? "").toLowerCase();
        return tokens.every(
          (t) => name.includes(t) || email.includes(t) || phone.includes(t)
        );
      });
    }

    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (segmentFilter !== "all") {
      result = result.filter((c) => c.segment === segmentFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "full_name":
          cmp = (a.full_name ?? "").localeCompare(b.full_name ?? "");
          break;
        case "email":
          cmp = (a.email ?? "").localeCompare(b.email ?? "");
          break;
        case "phone":
          cmp = (a.phone ?? "").localeCompare(b.phone ?? "");
          break;
        case "totalRevenue":
          cmp = a.totalRevenue - b.totalRevenue;
          break;
        case "purchaseCount":
          cmp = a.purchaseCount - b.purchaseCount;
          break;
        case "lastActivityDate":
          cmp =
            new Date(a.lastActivityDate ?? 0).getTime() -
            new Date(b.lastActivityDate ?? 0).getTime();
          break;
        case "status":
          cmp = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
          break;
        case "segment":
          cmp = (SEGMENT_ORDER[a.segment] ?? 9) - (SEGMENT_ORDER[b.segment] ?? 9);
          break;
        case "sources":
          cmp = a.sources.length - b.sources.length;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [customers, search, statusFilter, segmentFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleRowClick = (customerId: string) => {
    setSheetCustomerId(customerId);
    setSheetOpen(true);
  };

  const isActive = (key: SortKey) => sortKey === key;

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (!isActive(columnKey))
      return <ArrowUpDown className="ml-1 h-3 w-3 text-text-muted" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 text-text-primary" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-text-primary" />
    );
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      Active: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/10",
      "At Risk": "bg-amber-50 text-amber-700 hover:bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/10",
      Churned: "bg-rose-50 text-rose-700 hover:bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/10",
    };
    return (
      <Badge
        variant="secondary"
        className={`text-[11px] font-medium ${styles[status]}`}
      >
        {status}
      </Badge>
    );
  };

  const segmentBadge = (segment: string) => {
    const styles: Record<string, string> = {
      "High Value": "bg-surface-active text-text-on-active hover:bg-surface-active",
      Regular: "bg-surface-muted text-text-secondary hover:bg-surface-muted",
      "Low Value": "bg-surface-elevated text-text-muted hover:bg-surface-elevated",
    };
    return (
      <Badge
        variant="secondary"
        className={`text-[11px] font-medium ${styles[segment]}`}
      >
        {segment}
      </Badge>
    );
  };

  const sourceBadges = (sources: string[]) => {
    if (sources.length === 0) return null;
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {sources.map((s) => {
          const info = SOURCE_LABELS[s] ?? {
            label: s,
            color: "bg-surface-muted text-text-secondary",
          };
          return (
            <Badge
              key={s}
              variant="secondary"
              className={`text-[10px] font-medium px-1.5 py-0 ${info.color}`}
            >
              {info.label}
            </Badge>
          );
        })}
      </div>
    );
  };

  const activeFilters =
    (statusFilter !== "all" ? 1 : 0) + (segmentFilter !== "all" ? 1 : 0);

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          Customers
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {filtered.length} of {customers.length} customers
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3 ">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-[13px] h-9 border-border-default bg-surface"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] text-[13px] h-9 border-border-default bg-surface">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="At Risk">At Risk</SelectItem>
            <SelectItem value="Churned">Churned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={segmentFilter} onValueChange={setSegmentFilter}>
          <SelectTrigger className="w-[150px] text-[13px] h-9 border-border-default bg-surface">
            <SelectValue placeholder="Segment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Segments</SelectItem>
            <SelectItem value="High Value">High Value</SelectItem>
            <SelectItem value="Regular">Regular</SelectItem>
            <SelectItem value="Low Value">Low Value</SelectItem>
          </SelectContent>
        </Select>
        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-[12px] text-text-muted"
            onClick={() => {
              setStatusFilter("all");
              setSegmentFilter("all");
            }}
          >
            <X className="mr-1 h-3 w-3" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="border-border-default shadow-none ">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border-default">
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActive("full_name") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("full_name")}
              >
                <span className="flex items-center">
                  Customer <SortIcon columnKey="full_name" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActive("email") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("email")}
              >
                <span className="flex items-center">
                  Email <SortIcon columnKey="email" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActive("phone") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("phone")}
              >
                <span className="flex items-center">
                  Phone <SortIcon columnKey="phone" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none text-right ${isActive("totalRevenue") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("totalRevenue")}
              >
                <span className="flex items-center justify-end">
                  Revenue <SortIcon columnKey="totalRevenue" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none text-right ${isActive("purchaseCount") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("purchaseCount")}
              >
                <span className="flex items-center justify-end">
                  Purchases <SortIcon columnKey="purchaseCount" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActive("lastActivityDate") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("lastActivityDate")}
              >
                <span className="flex items-center">
                  Last Activity <SortIcon columnKey="lastActivityDate" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActive("status") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("status")}
              >
                <span className="flex items-center">
                  Status <SortIcon columnKey="status" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActive("segment") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("segment")}
              >
                <span className="flex items-center">
                  Segment <SortIcon columnKey="segment" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActive("sources") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("sources")}
              >
                <span className="flex items-center">
                  Sources <SortIcon columnKey="sources" />
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((customer) => (
              <TableRow
                key={customer.id}
                className="cursor-pointer border-border-muted hover:bg-surface-elevated/50 transition-colors"
                onClick={() => handleRowClick(customer.id)}
              >
                <TableCell>
                  <p className="text-[13px] font-medium text-text-primary">
                    {customer.full_name || "Unknown"}
                  </p>
                </TableCell>
                <TableCell className="text-[13px] text-text-secondary">
                  {customer.email || "-"}
                </TableCell>
                <TableCell className="text-[13px] text-text-secondary">
                  {customer.phone || "-"}
                </TableCell>
                <TableCell className="text-right text-[13px] font-medium text-text-primary tabular-nums">
                  $
                  {customer.totalRevenue.toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                  })}
                </TableCell>
                <TableCell className="text-right text-[13px] text-text-secondary tabular-nums">
                  {customer.purchaseCount}
                </TableCell>
                <TableCell className="text-[13px] text-text-secondary">
                  {customer.lastActivityDate
                    ? new Date(customer.lastActivityDate).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }
                      )
                    : "-"}
                </TableCell>
                <TableCell>{statusBadge(customer.status)}</TableCell>
                <TableCell>{segmentBadge(customer.segment)}</TableCell>
                <TableCell>{sourceBadges(customer.sources)}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-24 text-center text-[13px] text-text-muted"
                >
                  No customers match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Customer Detail Sheet */}
      <CustomerDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        customerId={sheetCustomerId}
      />
    </div>
  );
}
