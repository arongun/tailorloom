"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Filter,
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
import { riskBadge, tierBadge } from "@/components/badge-helpers";
import type { ComputedCustomer, ResolvedConfig } from "@/lib/insights/types";
import {
  isRevenueAtRisk,
  isRepeatCustomer,
  isInChannel,
} from "@/lib/insights/metrics";

type SortKey =
  | "full_name"
  | "lifetime_revenue"
  | "revenue_tier"
  | "risk_status"
  | "last_activity_date"
  | "primary_source";
type SortDir = "asc" | "desc";

const RISK_ORDER: Record<string, number> = {
  Healthy: 0,
  "At Risk": 1,
  Dormant: 2,
  Lost: 3,
};

const TIER_ORDER: Record<string, number> = {
  "Tier A": 0,
  "Tier B": 1,
  "Tier C": 2,
};

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  stripe: {
    label: "Stripe",
    color:
      "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  },
  calendly: {
    label: "Calendly",
    color: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  passline: {
    label: "PassLine",
    color:
      "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  },
  pos: {
    label: "POS",
    color:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  wetravel: {
    label: "WeTravel",
    color: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400",
  },
  manual: {
    label: "Manual",
    color: "bg-surface-muted text-text-secondary",
  },
};

const DRILLDOWN_LABELS: Record<string, string> = {
  revenue_at_risk: "Revenue at Risk",
  repeat_customers: "Repeat Customers",
  channel: "Channel",
};

export type RiskFilterValue = "all" | "Healthy" | "At Risk" | "Dormant" | "Lost";
export type TierFilterValue = "all" | "Tier A" | "Tier B" | "Tier C";
export type RepeatFilterValue = "all" | "repeat" | "one_time";

interface InitialFilters {
  risk: RiskFilterValue;
  tier: TierFilterValue;
  repeat: RepeatFilterValue;
  channel: string; // "all" | dynamic channel name validated server-side
}

interface CustomersClientProps {
  customers: ComputedCustomer[];
  config: ResolvedConfig;
  activeInsightFilter: { type: string; value?: string } | null;
  initialFilters?: InitialFilters;
}

export function CustomersClient({
  customers,
  config,
  activeInsightFilter,
  initialFilters,
}: CustomersClientProps) {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilterValue>(initialFilters?.risk ?? "all");
  const [tierFilter, setTierFilter] = useState<TierFilterValue>(initialFilters?.tier ?? "all");
  const [repeatFilter, setRepeatFilter] = useState<RepeatFilterValue>(initialFilters?.repeat ?? "all");
  const [channelFilter, setChannelFilter] = useState<string>(initialFilters?.channel ?? "all");
  const [sortKey, setSortKey] = useState<SortKey>("lifetime_revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sheetCustomerId, setSheetCustomerId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [insightFilter, setInsightFilter] = useState(activeInsightFilter);

  // Derive available channels from customer data
  const availableChannels = useMemo(() => {
    const channels = new Set<string>();
    for (const c of customers) {
      for (const ch of Object.keys(c.channel_revenue)) channels.add(ch);
    }
    return Array.from(channels).sort();
  }, [customers]);

  // Auto-open sheet if ?customer=<id> is in the URL — preserve other params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const customerId = params.get("customer");
    if (customerId) {
      setSheetCustomerId(customerId);
      setSheetOpen(true);
      // Selectively remove only "customer" param, preserve insight/value/profile
      params.delete("customer");
      const remaining = params.toString();
      const newUrl = remaining
        ? `${window.location.pathname}?${remaining}`
        : window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  const filtered = useMemo(() => {
    let result = [...customers];

    // Apply insight drilldown filter first
    if (insightFilter) {
      switch (insightFilter.type) {
        case "revenue_at_risk":
          result = result.filter((c) => isRevenueAtRisk(c, config));
          break;
        case "repeat_customers":
          result = result.filter((c) => isRepeatCustomer(c));
          break;
        case "channel":
          if (insightFilter.value) {
            result = result.filter((c) =>
              isInChannel(c, insightFilter.value!)
            );
          }
          break;
      }
    }

    if (search) {
      const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter((c) => {
        const name = (c.full_name ?? "").toLowerCase();
        const email = (c.email ?? "").toLowerCase();
        return tokens.every((t) => name.includes(t) || email.includes(t));
      });
    }

    if (riskFilter !== "all") {
      result = result.filter((c) => c.risk_status === riskFilter);
    }

    if (tierFilter !== "all") {
      result = result.filter((c) => c.revenue_tier === tierFilter);
    }

    if (repeatFilter === "repeat") {
      result = result.filter((c) => c.repeat_flag);
    } else if (repeatFilter === "one_time") {
      result = result.filter((c) => !c.repeat_flag);
    }

    if (channelFilter !== "all") {
      result = result.filter((c) => channelFilter in c.channel_revenue);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "full_name":
          cmp = (a.full_name ?? "").localeCompare(b.full_name ?? "");
          break;
        case "lifetime_revenue":
          cmp = a.lifetime_revenue - b.lifetime_revenue;
          break;
        case "revenue_tier":
          cmp =
            (TIER_ORDER[a.revenue_tier] ?? 9) -
            (TIER_ORDER[b.revenue_tier] ?? 9);
          break;
        case "risk_status":
          cmp =
            (RISK_ORDER[a.risk_status] ?? 9) -
            (RISK_ORDER[b.risk_status] ?? 9);
          break;
        case "last_activity_date":
          cmp =
            new Date(a.last_activity_date ?? 0).getTime() -
            new Date(b.last_activity_date ?? 0).getTime();
          break;
        case "primary_source":
          cmp = (a.primary_source ?? "").localeCompare(
            b.primary_source ?? ""
          );
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [customers, config, search, riskFilter, tierFilter, repeatFilter, channelFilter, sortKey, sortDir, insightFilter]);

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

  const dismissInsightFilter = () => {
    setInsightFilter(null);
    // Remove insight + value from URL, preserve profile
    const params = new URLSearchParams(window.location.search);
    params.delete("insight");
    params.delete("value");
    const remaining = params.toString();
    const newUrl = remaining
      ? `${window.location.pathname}?${remaining}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  };

  // Sync manual filters back to URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    riskFilter !== "all" ? params.set("risk", riskFilter) : params.delete("risk");
    tierFilter !== "all" ? params.set("tier", tierFilter) : params.delete("tier");
    repeatFilter !== "all" ? params.set("repeat", repeatFilter) : params.delete("repeat");
    channelFilter !== "all" ? params.set("channel", channelFilter) : params.delete("channel");
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, [riskFilter, tierFilter, repeatFilter, channelFilter]);

  const isActiveSort = (key: SortKey) => sortKey === key;

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (!isActiveSort(columnKey))
      return <ArrowUpDown className="ml-1 h-3 w-3 text-text-muted" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 text-text-primary" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-text-primary" />
    );
  };

  const sourceBadge = (source: string | null) => {
    if (!source) return <span className="text-[13px] text-text-muted">&ndash;</span>;
    const info = SOURCE_LABELS[source] ?? {
      label: source,
      color: "bg-surface-muted text-text-secondary",
    };
    return (
      <Badge
        variant="secondary"
        className={`text-[10px] font-medium px-1.5 py-0 ${info.color}`}
      >
        {info.label}
      </Badge>
    );
  };

  const activeFilters =
    (riskFilter !== "all" ? 1 : 0) +
    (tierFilter !== "all" ? 1 : 0) +
    (repeatFilter !== "all" ? 1 : 0) +
    (channelFilter !== "all" ? 1 : 0);

  const insightLabel = insightFilter
    ? insightFilter.type === "channel" && insightFilter.value
      ? `Channel: ${insightFilter.value}`
      : DRILLDOWN_LABELS[insightFilter.type] ?? insightFilter.type
    : null;

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

      {/* Insight drilldown chip */}
      {insightFilter && insightLabel && (
        <div className="mb-4 flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-elevated px-3 py-1.5">
            <Filter className="h-3.5 w-3.5 text-text-muted" />
            <span className="text-[12px] font-medium text-text-primary">
              {insightLabel}
            </span>
            <button
              onClick={dismissInsightFilter}
              className="flex items-center justify-center h-4 w-4 rounded-full hover:bg-surface-muted transition-colors"
            >
              <X className="h-3 w-3 text-text-muted" />
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-[13px] h-9 border-border-default bg-surface"
          />
        </div>
        <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskFilterValue)}>
          <SelectTrigger className="w-[150px] text-[13px] h-9 border-border-default bg-surface">
            <SelectValue placeholder="Risk Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Status</SelectItem>
            <SelectItem value="Healthy">Healthy</SelectItem>
            <SelectItem value="At Risk">At Risk</SelectItem>
            <SelectItem value="Dormant">Dormant</SelectItem>
            <SelectItem value="Lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as TierFilterValue)}>
          <SelectTrigger className="w-[150px] text-[13px] h-9 border-border-default bg-surface">
            <SelectValue placeholder="Revenue Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="Tier A">Tier A</SelectItem>
            <SelectItem value="Tier B">Tier B</SelectItem>
            <SelectItem value="Tier C">Tier C</SelectItem>
          </SelectContent>
        </Select>
        <Select value={repeatFilter} onValueChange={(v) => setRepeatFilter(v as RepeatFilterValue)}>
          <SelectTrigger className="w-[150px] text-[13px] h-9 border-border-default bg-surface">
            <SelectValue placeholder="Repeat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="repeat">Repeat</SelectItem>
            <SelectItem value="one_time">One-time</SelectItem>
          </SelectContent>
        </Select>
        {availableChannels.length > 0 && (
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[150px] text-[13px] h-9 border-border-default bg-surface">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {availableChannels.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {ch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-[12px] text-text-muted"
            onClick={() => {
              setRiskFilter("all");
              setTierFilter("all");
              setRepeatFilter("all");
              setChannelFilter("all");
            }}
          >
            <X className="mr-1 h-3 w-3" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="border-border-default shadow-none">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border-default">
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActiveSort("full_name") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("full_name")}
              >
                <span className="flex items-center">
                  Customer <SortIcon columnKey="full_name" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none text-right ${isActiveSort("lifetime_revenue") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("lifetime_revenue")}
              >
                <span className="flex items-center justify-end">
                  Lifetime Revenue <SortIcon columnKey="lifetime_revenue" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActiveSort("revenue_tier") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("revenue_tier")}
              >
                <span className="flex items-center">
                  Revenue Tier <SortIcon columnKey="revenue_tier" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActiveSort("risk_status") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("risk_status")}
              >
                <span className="flex items-center">
                  Risk Status <SortIcon columnKey="risk_status" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActiveSort("last_activity_date") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("last_activity_date")}
              >
                <span className="flex items-center">
                  Last Activity <SortIcon columnKey="last_activity_date" />
                </span>
              </TableHead>
              <TableHead
                className={`text-[11px] font-medium tracking-wide uppercase cursor-pointer select-none ${isActiveSort("primary_source") ? "text-text-primary" : "text-text-muted"}`}
                onClick={() => handleSort("primary_source")}
              >
                <span className="flex items-center">
                  Primary Source <SortIcon columnKey="primary_source" />
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
                  {customer.email && (
                    <p className="text-[11px] text-text-muted truncate max-w-[200px]">
                      {customer.email}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right text-[13px] font-medium text-text-primary tabular-nums">
                  $
                  {customer.lifetime_revenue.toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                  })}
                </TableCell>
                <TableCell>{tierBadge(customer.revenue_tier)}</TableCell>
                <TableCell>{riskBadge(customer.risk_status)}</TableCell>
                <TableCell className="text-[13px] text-text-secondary">
                  {customer.last_activity_date
                    ? new Date(
                        customer.last_activity_date
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "\u2013"}
                </TableCell>
                <TableCell>{sourceBadge(customer.primary_source)}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
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
