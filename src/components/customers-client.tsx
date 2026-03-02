"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { CustomerDetailSheet } from "@/components/customer-detail-sheet";
import { FilterMultiSelect } from "@/components/filter-multi-select";
import { riskBadge, tierBadge } from "@/components/badge-helpers";
import type { ComputedCustomer, ResolvedConfig } from "@/lib/insights/types";
import {
  isRevenueAtRisk,
  isRepeatCustomer,
  isInChannel,
} from "@/lib/insights/metrics";

// ── Constants ───────────────────────────────────────────────

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

// ── Filter option definitions ───────────────────────────────

const SEGMENT_OPTIONS = [
  { value: "revenue_at_risk", label: "Revenue at Risk" },
  { value: "repeat_customers", label: "Repeat Customers" },
  { value: "channel", label: "Channel" },
];
const ALL_SEGMENTS = new Set(SEGMENT_OPTIONS.map((o) => o.value));

const RISK_OPTIONS = [
  { value: "Healthy", label: "Healthy" },
  { value: "At Risk", label: "At Risk" },
  { value: "Dormant", label: "Dormant" },
  { value: "Lost", label: "Lost" },
];
const ALL_RISKS = new Set(RISK_OPTIONS.map((o) => o.value));

const TIER_OPTIONS = [
  { value: "Tier A", label: "Tier A" },
  { value: "Tier B", label: "Tier B" },
  { value: "Tier C", label: "Tier C" },
];
const ALL_TIERS = new Set(TIER_OPTIONS.map((o) => o.value));

const REPEAT_OPTIONS = [
  { value: "repeat", label: "Repeat" },
  { value: "one_time", label: "One-time" },
];
const ALL_REPEATS = new Set(REPEAT_OPTIONS.map((o) => o.value));

// ── URL helpers ─────────────────────────────────────────────

/** Build initial Set from URL params — empty array = all selected (default) */
function initSet(parsed: string[], allValues: Set<string>): Set<string> {
  return parsed.length > 0 ? new Set(parsed) : new Set(allValues);
}

// ── Props ───────────────────────────────────────────────────

export interface InitialFilterArrays {
  segment: string[];
  risk: string[];
  tier: string[];
  repeat: string[];
  channel: string[];
}

interface CustomersClientProps {
  customers: ComputedCustomer[];
  config: ResolvedConfig;
  initialFilters: InitialFilterArrays;
}

// ── Component ───────────────────────────────────────────────

export function CustomersClient({
  customers,
  config,
  initialFilters,
}: CustomersClientProps) {
  // Derive available channels from customer data
  const { channelOptions, allChannels } = useMemo(() => {
    const channels = new Set<string>();
    for (const c of customers) {
      for (const ch of Object.keys(c.channel_revenue)) channels.add(ch);
    }
    const sorted = Array.from(channels).sort();
    return {
      channelOptions: sorted.map((ch) => ({ value: ch, label: ch })),
      allChannels: new Set(sorted),
    };
  }, [customers]);

  // ── State ───────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState(() =>
    initSet(initialFilters.segment, ALL_SEGMENTS)
  );
  const [riskFilter, setRiskFilter] = useState(() =>
    initSet(initialFilters.risk, ALL_RISKS)
  );
  const [tierFilter, setTierFilter] = useState(() =>
    initSet(initialFilters.tier, ALL_TIERS)
  );
  const [repeatFilter, setRepeatFilter] = useState(() =>
    initSet(initialFilters.repeat, ALL_REPEATS)
  );
  const [channelFilter, setChannelFilter] = useState(() =>
    initSet(initialFilters.channel, allChannels)
  );
  const [sortKey, setSortKey] = useState<SortKey>("lifetime_revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sheetCustomerId, setSheetCustomerId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── Sheet auto-open from ?customer= ─────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const customerId = params.get("customer");
    if (customerId) {
      setSheetCustomerId(customerId);
      setSheetOpen(true);
      params.delete("customer");
      const remaining = params.toString();
      const newUrl = remaining
        ? `${window.location.pathname}?${remaining}`
        : window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  // ── Filtering ───────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = [...customers];

    // Segment filter — OR within group using exact shared predicates
    const segAll = segmentFilter.size === ALL_SEGMENTS.size;
    if (!segAll && segmentFilter.size > 0) {
      result = result.filter((c) => {
        if (segmentFilter.has("revenue_at_risk") && isRevenueAtRisk(c, config))
          return true;
        if (segmentFilter.has("repeat_customers") && isRepeatCustomer(c))
          return true;
        if (segmentFilter.has("channel")) {
          // Channel segment: customer passes if they're in ANY of the selected channels
          const chAll = channelFilter.size === allChannels.size;
          if (chAll) {
            // All channels selected — any customer with channel data passes
            if (Object.keys(c.channel_revenue).length > 0) return true;
          } else {
            for (const ch of channelFilter) {
              if (isInChannel(c, ch)) return true;
            }
          }
        }
        return false;
      });
    }

    // Search
    if (search) {
      const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter((c) => {
        const name = (c.full_name ?? "").toLowerCase();
        const email = (c.email ?? "").toLowerCase();
        return tokens.every((t) => name.includes(t) || email.includes(t));
      });
    }

    // Risk filter — OR within group
    if (riskFilter.size < ALL_RISKS.size) {
      result = result.filter((c) => riskFilter.has(c.risk_status));
    }

    // Tier filter — OR within group
    if (tierFilter.size < ALL_TIERS.size) {
      result = result.filter((c) => tierFilter.has(c.revenue_tier));
    }

    // Repeat filter — OR within group
    if (repeatFilter.size < ALL_REPEATS.size) {
      result = result.filter((c) => {
        if (repeatFilter.has("repeat") && c.repeat_flag) return true;
        if (repeatFilter.has("one_time") && !c.repeat_flag) return true;
        return false;
      });
    }

    // Channel filter (standalone, when segment is not active or is "all")
    // Only apply as additive filter when segment is "all" (all selected)
    if (segAll && channelFilter.size < allChannels.size && allChannels.size > 0) {
      result = result.filter((c) => {
        for (const ch of channelFilter) {
          if (ch in c.channel_revenue) return true;
        }
        return false;
      });
    }

    // Sort
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
  }, [customers, config, segmentFilter, search, riskFilter, tierFilter, repeatFilter, channelFilter, allChannels, sortKey, sortDir]);

  // ── URL sync ────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Helper: write set to URL as repeated params, omit if all selected
    const syncSet = (key: string, set: Set<string>, allSet: Set<string>) => {
      params.delete(key);
      if (set.size < allSet.size) {
        for (const v of set) params.append(key, v);
      }
    };
    syncSet("segment", segmentFilter, ALL_SEGMENTS);
    syncSet("risk", riskFilter, ALL_RISKS);
    syncSet("tier", tierFilter, ALL_TIERS);
    syncSet("repeat", repeatFilter, ALL_REPEATS);
    syncSet("channel", channelFilter, allChannels);
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, [segmentFilter, riskFilter, tierFilter, repeatFilter, channelFilter, allChannels]);

  // ── Handlers ────────────────────────────────────────────
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

  const clearAllFilters = useCallback(() => {
    setSegmentFilter(new Set(ALL_SEGMENTS));
    setRiskFilter(new Set(ALL_RISKS));
    setTierFilter(new Set(ALL_TIERS));
    setRepeatFilter(new Set(ALL_REPEATS));
    setChannelFilter(new Set(allChannels));
  }, [allChannels]);

  // ── Derived ─────────────────────────────────────────────
  const isActiveSort = (key: SortKey) => sortKey === key;

  const hasActiveFilters =
    segmentFilter.size < ALL_SEGMENTS.size ||
    riskFilter.size < ALL_RISKS.size ||
    tierFilter.size < ALL_TIERS.size ||
    repeatFilter.size < ALL_REPEATS.size ||
    (allChannels.size > 0 && channelFilter.size < allChannels.size);

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
    if (!source)
      return <span className="text-[13px] text-text-muted">&ndash;</span>;
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

      {/* Filter bar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-[13px] h-9 border-border-default bg-surface"
          />
        </div>
        <FilterMultiSelect
          label="Segment"
          options={SEGMENT_OPTIONS}
          selected={segmentFilter}
          allValues={ALL_SEGMENTS}
          onChange={setSegmentFilter}
          width="w-[160px]"
        />
        <FilterMultiSelect
          label="Risk"
          options={RISK_OPTIONS}
          selected={riskFilter}
          allValues={ALL_RISKS}
          onChange={setRiskFilter}
        />
        <FilterMultiSelect
          label="Tier"
          options={TIER_OPTIONS}
          selected={tierFilter}
          allValues={ALL_TIERS}
          onChange={setTierFilter}
        />
        <FilterMultiSelect
          label="Repeat"
          options={REPEAT_OPTIONS}
          selected={repeatFilter}
          allValues={ALL_REPEATS}
          onChange={setRepeatFilter}
        />
        {channelOptions.length > 0 && (
          <FilterMultiSelect
            label="Channel"
            options={channelOptions}
            selected={channelFilter}
            allValues={allChannels}
            onChange={setChannelFilter}
          />
        )}
      </div>

      {/* Clear filters row — always takes space, button fades in/out */}
      <div className="mb-4 flex justify-end h-7">
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 text-[12px] text-text-muted transition-opacity ${
            hasActiveFilters ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={clearAllFilters}
        >
          <X className="mr-1 h-3 w-3" />
          Clear filters
        </Button>
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
