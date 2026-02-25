"use client";

import { useState, useMemo } from "react";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Loader2,
  CreditCard,
  Calendar,
  UserCheck,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCustomerDetail } from "@/lib/actions/dashboard";
import type { CustomerRow, CustomerDetail } from "@/lib/actions/dashboard";

type SortKey = "full_name" | "totalRevenue" | "purchaseCount" | "lastActivityDate";
type SortDir = "asc" | "desc";

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  stripe: { label: "Stripe", color: "bg-violet-50 text-violet-700" },
  calendly: { label: "Calendly", color: "bg-blue-50 text-blue-700" },
  passline: { label: "PassLine", color: "bg-orange-50 text-orange-700" },
  pos: { label: "POS", color: "bg-emerald-50 text-emerald-700" },
  wetravel: { label: "WeTravel", color: "bg-cyan-50 text-cyan-700" },
  manual: { label: "Manual", color: "bg-slate-100 text-slate-600" },
};

const TRANSACTION_ICONS: Record<string, typeof CreditCard> = {
  payment: CreditCard,
  booking: Calendar,
  attendance: UserCheck,
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
  const [selectedDetail, setSelectedDetail] = useState<CustomerDetail | null>(
    null
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const filtered = useMemo(() => {
    let result = [...customers];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          (c.full_name ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q)
      );
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

  const handleRowClick = async (customerId: string) => {
    setSheetOpen(true);
    setLoadingDetail(true);
    setSelectedDetail(null);
    try {
      const detail = await getCustomerDetail(customerId);
      setSelectedDetail(detail);
    } catch {
      // Leave detail null on error
    } finally {
      setLoadingDetail(false);
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey)
      return <ArrowUpDown className="ml-1 h-3 w-3 text-slate-300" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 text-slate-600" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-slate-600" />
    );
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      Active: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
      "At Risk": "bg-amber-50 text-amber-700 hover:bg-amber-50",
      Churned: "bg-rose-50 text-rose-700 hover:bg-rose-50",
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
      "High Value": "bg-slate-900 text-white hover:bg-slate-900",
      Regular: "bg-slate-100 text-slate-700 hover:bg-slate-100",
      "Low Value": "bg-slate-50 text-slate-500 hover:bg-slate-50",
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
            color: "bg-slate-100 text-slate-600",
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
      <div className="mb-6 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
          Customers
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          {filtered.length} of {customers.length} customers
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3 animate-fade-in stagger-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-[13px] h-9 border-slate-200 bg-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] text-[13px] h-9 border-slate-200 bg-white">
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
          <SelectTrigger className="w-[150px] text-[13px] h-9 border-slate-200 bg-white">
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
            className="h-9 text-[12px] text-slate-500"
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
      <Card className="border-slate-200 shadow-none animate-fade-in-up stagger-3">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-slate-200">
              <TableHead
                className="text-[11px] font-medium tracking-wide text-slate-500 uppercase cursor-pointer select-none"
                onClick={() => handleSort("full_name")}
              >
                <span className="flex items-center">
                  Customer <SortIcon columnKey="full_name" />
                </span>
              </TableHead>
              <TableHead className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                Email
              </TableHead>
              <TableHead
                className="text-[11px] font-medium tracking-wide text-slate-500 uppercase cursor-pointer select-none text-right"
                onClick={() => handleSort("totalRevenue")}
              >
                <span className="flex items-center justify-end">
                  Revenue <SortIcon columnKey="totalRevenue" />
                </span>
              </TableHead>
              <TableHead
                className="text-[11px] font-medium tracking-wide text-slate-500 uppercase cursor-pointer select-none text-right"
                onClick={() => handleSort("purchaseCount")}
              >
                <span className="flex items-center justify-end">
                  Purchases <SortIcon columnKey="purchaseCount" />
                </span>
              </TableHead>
              <TableHead
                className="text-[11px] font-medium tracking-wide text-slate-500 uppercase cursor-pointer select-none"
                onClick={() => handleSort("lastActivityDate")}
              >
                <span className="flex items-center">
                  Last Activity <SortIcon columnKey="lastActivityDate" />
                </span>
              </TableHead>
              <TableHead className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                Status
              </TableHead>
              <TableHead className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                Segment
              </TableHead>
              <TableHead className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                Sources
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((customer) => (
              <TableRow
                key={customer.id}
                className="cursor-pointer border-slate-100 hover:bg-slate-50/50 transition-colors"
                onClick={() => handleRowClick(customer.id)}
              >
                <TableCell>
                  <p className="text-[13px] font-medium text-slate-900">
                    {customer.full_name || "Unknown"}
                  </p>
                </TableCell>
                <TableCell className="text-[13px] text-slate-600">
                  {customer.email || "-"}
                </TableCell>
                <TableCell className="text-right text-[13px] font-medium text-slate-900 tabular-nums">
                  $
                  {customer.totalRevenue.toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                  })}
                </TableCell>
                <TableCell className="text-right text-[13px] text-slate-600 tabular-nums">
                  {customer.purchaseCount}
                </TableCell>
                <TableCell className="text-[13px] text-slate-600">
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
                  colSpan={8}
                  className="h-24 text-center text-[13px] text-slate-400"
                >
                  No customers match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Customer Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[480px] sm:w-[540px] overflow-y-auto">
          {loadingDetail && (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
            </div>
          )}
          {!loadingDetail && selectedDetail && (
            <div className="px-6 pb-6">
              <SheetHeader className="pb-4 px-0">
                <SheetTitle className="text-lg font-semibold text-slate-900">
                  {selectedDetail.customer.full_name || "Unknown Customer"}
                </SheetTitle>
                <p className="text-[12px] text-slate-400">
                  {selectedDetail.customer.email || "No email"}
                </p>
                {selectedDetail.customer.sources.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {selectedDetail.customer.sources.map((s) => {
                      const info = SOURCE_LABELS[s] ?? {
                        label: s,
                        color: "bg-slate-100 text-slate-600",
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
                )}
              </SheetHeader>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <Card className="border-slate-200 shadow-none">
                  <CardContent className="p-3">
                    <p className="text-[10px] font-medium tracking-wide text-slate-500 uppercase mb-1">
                      Revenue
                    </p>
                    <p className="text-[16px] font-semibold text-slate-900 tabular-nums">
                      ${selectedDetail.customer.totalRevenue.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-none">
                  <CardContent className="p-3">
                    <p className="text-[10px] font-medium tracking-wide text-slate-500 uppercase mb-1">
                      Purchases
                    </p>
                    <p className="text-[16px] font-semibold text-slate-900 tabular-nums">
                      {selectedDetail.customer.purchaseCount}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-none">
                  <CardContent className="p-3">
                    <p className="text-[10px] font-medium tracking-wide text-slate-500 uppercase mb-1">
                      Status
                    </p>
                    <div className="mt-0.5">
                      {statusBadge(selectedDetail.customer.status)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Separator className="mb-6" />

              <div>
                <h3 className="text-[13px] font-semibold text-slate-900 mb-4">
                  Activity History
                </h3>
                <div className="space-y-3">
                  {selectedDetail.transactions.map((tx) => {
                    const Icon =
                      TRANSACTION_ICONS[tx.type] ?? CreditCard;
                    const sourceInfo = SOURCE_LABELS[tx.source] ?? {
                      label: tx.source,
                      color: "bg-slate-100 text-slate-600",
                    };
                    return (
                      <div
                        key={tx.id}
                        className="flex items-start justify-between rounded-lg border border-slate-100 p-3"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-50 mt-0.5">
                            <Icon className="h-3.5 w-3.5 text-slate-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-slate-900 truncate">
                              {tx.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] font-medium px-1.5 py-0 ${sourceInfo.color}`}
                              >
                                {sourceInfo.label}
                              </Badge>
                              <span className="text-[11px] text-slate-400">
                                {new Date(tx.date).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  }
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                        {tx.amount !== null && (
                          <p className="text-[14px] font-semibold text-slate-900 tabular-nums ml-4">
                            $
                            {tx.amount.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {selectedDetail.transactions.length === 0 && (
                    <p className="text-[13px] text-slate-400 text-center py-8">
                      No activity history available.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          {!loadingDetail && !selectedDetail && (
            <div className="flex items-center justify-center h-64">
              <p className="text-[13px] text-slate-400">
                Customer not found.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
