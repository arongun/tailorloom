"use client";

import { useState, useMemo } from "react";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";
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
import {
  computeCustomerMetrics,
  type CustomerWithMetrics,
} from "@/lib/data/revenue-dashboard";

type SortKey = "name" | "totalRevenue" | "purchaseCount" | "lastPurchaseDate";
type SortDir = "asc" | "desc";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("totalRevenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerWithMetrics | null>(null);

  const customers = useMemo(() => computeCustomerMetrics(), []);

  const filtered = useMemo(() => {
    let result = [...customers];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q)
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
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "totalRevenue":
          cmp = a.totalRevenue - b.totalRevenue;
          break;
        case "purchaseCount":
          cmp = a.purchaseCount - b.purchaseCount;
          break;
        case "lastPurchaseDate":
          cmp =
            new Date(a.lastPurchaseDate).getTime() -
            new Date(b.lastPurchaseDate).getTime();
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
            placeholder="Search by name, email, or company..."
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
                onClick={() => handleSort("name")}
              >
                <span className="flex items-center">
                  Customer <SortIcon columnKey="name" />
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
                onClick={() => handleSort("lastPurchaseDate")}
              >
                <span className="flex items-center">
                  Last Purchase <SortIcon columnKey="lastPurchaseDate" />
                </span>
              </TableHead>
              <TableHead className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                Status
              </TableHead>
              <TableHead className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                Segment
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((customer) => (
              <TableRow
                key={customer.id}
                className="cursor-pointer border-slate-100 hover:bg-slate-50/50 transition-colors"
                onClick={() => setSelectedCustomer(customer)}
              >
                <TableCell>
                  <div>
                    <p className="text-[13px] font-medium text-slate-900">
                      {customer.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {customer.company}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-[13px] text-slate-600">
                  {customer.email}
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
                  {new Date(customer.lastPurchaseDate).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }
                  )}
                </TableCell>
                <TableCell>{statusBadge(customer.status)}</TableCell>
                <TableCell>{segmentBadge(customer.segment)}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
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
      <Sheet
        open={!!selectedCustomer}
        onOpenChange={() => setSelectedCustomer(null)}
      >
        <SheetContent className="w-[480px] sm:w-[540px] overflow-y-auto">
          {selectedCustomer && (
            <div className="px-6 pb-6">
              <SheetHeader className="pb-4 px-0">
                <SheetTitle className="text-lg font-semibold text-slate-900">
                  {selectedCustomer.name}
                </SheetTitle>
                <p className="text-[13px] text-slate-500">
                  {selectedCustomer.company}
                </p>
                <p className="text-[12px] text-slate-400">
                  {selectedCustomer.email}
                </p>
              </SheetHeader>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <Card className="border-slate-200 shadow-none">
                  <CardContent className="p-3">
                    <p className="text-[10px] font-medium tracking-wide text-slate-500 uppercase mb-1">
                      Revenue
                    </p>
                    <p className="text-[16px] font-semibold text-slate-900 tabular-nums">
                      ${selectedCustomer.totalRevenue.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-none">
                  <CardContent className="p-3">
                    <p className="text-[10px] font-medium tracking-wide text-slate-500 uppercase mb-1">
                      Purchases
                    </p>
                    <p className="text-[16px] font-semibold text-slate-900 tabular-nums">
                      {selectedCustomer.purchaseCount}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-none">
                  <CardContent className="p-3">
                    <p className="text-[10px] font-medium tracking-wide text-slate-500 uppercase mb-1">
                      Status
                    </p>
                    <div className="mt-0.5">
                      {statusBadge(selectedCustomer.status)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Separator className="mb-6" />

              <div>
                <h3 className="text-[13px] font-semibold text-slate-900 mb-4">
                  Purchase History
                </h3>
                <div className="space-y-3">
                  {selectedCustomer.purchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="flex items-start justify-between rounded-lg border border-slate-100 p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-slate-900 truncate">
                          {purchase.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-slate-100 text-slate-600 hover:bg-slate-100"
                          >
                            {purchase.category}
                          </Badge>
                          <span className="text-[11px] text-slate-400">
                            {new Date(purchase.date).toLocaleDateString(
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
                      <p className="text-[14px] font-semibold text-slate-900 tabular-nums ml-4">
                        $
                        {purchase.amount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  ))}
                  {selectedCustomer.purchases.length === 0 && (
                    <p className="text-[13px] text-slate-400 text-center py-8">
                      No purchase history available.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
