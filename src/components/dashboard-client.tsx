"use client";

import { useState, useRef, useEffect } from "react";
import { Info, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { RevenueChart } from "@/components/revenue-chart";
import { DateRangePicker } from "@/components/date-range-picker";
import { useDateRange } from "@/app/(dashboard)/dashboard-context";
import {
  getRevenueTrend,
  getRevenueBySource,
  getTopCustomers,
} from "@/lib/actions/dashboard";
import type { ResolvedConfig, InsightResult } from "@/lib/insights/types";
import type {
  RevenueTrendData,
  RevenueBySourceItem,
  TopCustomer,
  DateRangeParam,
} from "@/lib/types/dashboard";

interface DashboardClientProps {
  config: ResolvedConfig;
  insightResults: InsightResult[];
  initialTrend: RevenueTrendData;
  initialTopCustomers: TopCustomer[];
  initialRevenueBySource: RevenueBySourceItem[];
}

const SOURCE_COLORS: Record<string, string> = {
  stripe: "#3b82f6",
  pos: "#22c55e",
  wetravel: "#a855f7",
  calendly: "#f97316",
  passline: "#14b8a6",
  manual: "#64748b",
};

const SOURCE_LABELS: Record<string, string> = {
  stripe: "Stripe",
  pos: "POS",
  wetravel: "WeTravel",
  calendly: "Calendly",
  passline: "PassLine",
  manual: "Manual",
};

const CATEGORY_STYLES: Record<string, string> = {
  Retention:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  Growth:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  Ops: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  Action:
    "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
};

export function DashboardClient({
  config,
  insightResults,
  initialTrend,
  initialTopCustomers,
  initialRevenueBySource,
}: DashboardClientProps) {
  const router = useRouter();
  const { dateRange } = useDateRange();
  const [trendData, setTrendData] = useState<RevenueTrendData>(initialTrend);
  const [topCustomers, setTopCustomers] =
    useState<TopCustomer[]>(initialTopCustomers);
  const [revenueBySource, setRevenueBySource] = useState<RevenueBySourceItem[]>(
    initialRevenueBySource
  );
  const [chartMode, setChartMode] = useState<"total" | "bySource">("total");
  const [loading, setLoading] = useState(false);

  const hasAnimated = useRef(false);
  const showAnimation = !hasAnimated.current;

  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  // Refetch chart data when dateRange changes (3 calls, not insight cards)
  const pendingCount = useRef(0);

  useEffect(() => {
    const dateRangeParam: DateRangeParam | undefined = dateRange.from
      ? {
          from: dateRange.from.toISOString(),
          to: dateRange.to?.toISOString() ?? null,
        }
      : undefined;

    pendingCount.current = 3;
    setLoading(true);

    getRevenueTrend(dateRangeParam)
      .then(setTrendData)
      .catch(() => {})
      .finally(() => {
        if (--pendingCount.current === 0) setLoading(false);
      });

    getTopCustomers(dateRangeParam)
      .then(setTopCustomers)
      .catch(() => {})
      .finally(() => {
        if (--pendingCount.current === 0) setLoading(false);
      });

    getRevenueBySource(dateRangeParam)
      .then(setRevenueBySource)
      .catch(() => {})
      .finally(() => {
        if (--pendingCount.current === 0) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const handleInsightClick = (result: InsightResult) => {
    if (result.disabled) return;
    const params = new URLSearchParams();
    if (config.profile_id) {
      params.set("profile", config.profile_id);
    }
    // Pre-select just the matching segment in multi-select
    params.append("segment", result.drilldownFilter.type);
    if (result.drilldownFilter.type === "channel" && result.drilldownFilter.value) {
      params.append("channel", result.drilldownFilter.value);
    }
    router.push(`/customers?${params.toString()}`);
  };

  // Split insight results by row
  const row1 = insightResults.filter((r) => r.row === 1);
  const row2 = insightResults.filter((r) => r.row === 2);

  return (
    <TooltipProvider>
    <div
      className={`p-8 max-w-[1400px] ${showAnimation ? "animate-fade-in" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
            Dashboard
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Revenue overview and customer intelligence
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <Loader2 className="h-4 w-4 text-text-muted animate-spin" />
          )}
          <DateRangePicker />
        </div>
      </div>

      {/* Row 1 — Action Required */}
      {row1.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-medium tracking-widest uppercase text-text-muted mb-3">
            Action Required
          </p>
          <div className="grid grid-cols-3 gap-4">
            {row1.map((result, idx) => (
              <Card
                key={result.id}
                className={`border-border-default shadow-none transition-colors group ${
                  result.disabled
                    ? "opacity-60 cursor-default"
                    : "cursor-pointer hover:border-border-default hover:bg-surface-elevated/50 hover:shadow-sm"
                } ${showAnimation ? `animate-fade-in-up stagger-${idx + 1}` : ""}`}
                onClick={() => handleInsightClick(result)}
              >
                <CardContent className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-medium text-text-muted">
                      {result.title}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                            <Info className="h-3.5 w-3.5 text-text-muted/50 hover:text-text-muted transition-colors cursor-help" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={4}>
                          <p className="max-w-[200px]">{result.description}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-medium px-1.5 py-0 ${
                          CATEGORY_STYLES[result.category] ?? ""
                        }`}
                      >
                        {result.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xl font-semibold tracking-[-0.02em] text-text-primary tabular-nums">
                    {result.primaryValue}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5 tabular-nums">
                    {result.secondaryValue}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Row 2 — Intelligence */}
      <div className="mb-6">
        <p className="text-[11px] font-medium tracking-widest uppercase text-text-muted mb-3">
          Intelligence
        </p>
        <div className="grid grid-cols-3 gap-4">
          {/* Col 1: Channel Revenue card */}
          {row2[0] && (() => {
            const result = row2[0];
            return (
              <Card
                key={result.id}
                className={`border-border-default shadow-none transition-colors group ${
                  result.disabled
                    ? "opacity-60 cursor-default"
                    : "cursor-pointer hover:border-border-default hover:bg-surface-elevated/50 hover:shadow-sm"
                } ${showAnimation ? "animate-fade-in-up stagger-4" : ""}`}
                onClick={() => handleInsightClick(result)}
              >
                <CardContent className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-medium text-text-muted">
                      {result.title}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                            <Info className="h-3.5 w-3.5 text-text-muted/50 hover:text-text-muted transition-colors cursor-help" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={4}>
                          <p className="max-w-[200px]">{result.description}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-medium px-1.5 py-0 ${
                          CATEGORY_STYLES[result.category] ?? ""
                        }`}
                      >
                        {result.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xl font-semibold tracking-[-0.02em] text-text-primary tabular-nums">
                    {result.primaryValue}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5 tabular-nums">
                    {result.secondaryValue}
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          {/* Col 2: Revenue by Source widget */}
          <Card className="border-border-default shadow-none">
            <CardContent className="px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-medium text-text-muted">
                  Revenue by Source
                </p>
                <Badge
                  variant="secondary"
                  className={`text-[10px] font-medium px-1.5 py-0 ${CATEGORY_STYLES.Ops}`}
                >
                  Ops
                </Badge>
              </div>
              {revenueBySource.length === 0 ? (
                <p className="text-[13px] text-text-muted py-4">
                  No revenue data yet.
                </p>
              ) : (
                <div className="space-y-2 mt-1">
                  {revenueBySource.map((item) => {
                    const color = SOURCE_COLORS[item.source] ?? "#94a3b8";
                    return (
                      <div key={item.source}>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-[12px] font-medium text-text-primary">
                              {SOURCE_LABELS[item.source] ?? item.source}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-semibold text-text-primary tabular-nums">
                              $
                              {item.revenue.toLocaleString("en-US", {
                                minimumFractionDigits: 0,
                              })}
                            </span>
                            <span className="text-[10px] text-text-muted tabular-nums w-8 text-right">
                              {item.percentage}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1 rounded-full bg-surface-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${item.percentage}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Col 3: Revenue Concentration card */}
          {row2[1] && (() => {
            const result = row2[1];
            return (
              <Card
                key={result.id}
                className={`border-border-default shadow-none transition-colors group ${
                  result.disabled
                    ? "opacity-60 cursor-default"
                    : "cursor-pointer hover:border-border-default hover:bg-surface-elevated/50 hover:shadow-sm"
                } ${showAnimation ? "animate-fade-in-up stagger-6" : ""}`}
                onClick={() => handleInsightClick(result)}
              >
                <CardContent className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-medium text-text-muted">
                      {result.title}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                            <Info className="h-3.5 w-3.5 text-text-muted/50 hover:text-text-muted transition-colors cursor-help" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={4}>
                          <p className="max-w-[200px]">{result.description}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-medium px-1.5 py-0 ${
                          CATEGORY_STYLES[result.category] ?? ""
                        }`}
                      >
                        {result.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xl font-semibold tracking-[-0.02em] text-text-primary tabular-nums">
                    {result.primaryValue}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5 tabular-nums">
                    {result.secondaryValue}
                  </p>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      </div>

      {/* Row 3 — Context */}
      <div className="mb-6">
        <p className="text-[11px] font-medium tracking-widest uppercase text-text-muted mb-3">
          Context
        </p>

        <div className="flex gap-4">
          {/* Revenue Trend Chart */}
          <Card className="flex-[3] border-border-default shadow-none">
            <CardHeader className="px-6 pt-6 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-[14px] font-semibold text-text-primary">
                    Revenue Trend
                  </CardTitle>
                  <p className="text-[12px] text-text-muted mt-0.5">
                    {trendData.interval === "day"
                      ? "Daily"
                      : trendData.interval === "week"
                        ? "Weekly"
                        : "Monthly"}{" "}
                    revenue over time
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-border-default p-0.5">
                  <button
                    onClick={() => setChartMode("total")}
                    className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                      chartMode === "total"
                        ? "bg-surface-active text-text-on-active"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    Total
                  </button>
                  <button
                    onClick={() => setChartMode("bySource")}
                    className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                      chartMode === "bySource"
                        ? "bg-surface-active text-text-on-active"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    By Source
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-2">
              <RevenueChart
                data={trendData.total}
                mode={chartMode}
                bySourceData={trendData.bySource}
              />
            </CardContent>
          </Card>

          {/* Top Customers */}
          <Card className="flex-[2] border-border-default shadow-none">
            <CardHeader className="px-6 pt-5 pb-3">
              <CardTitle className="text-[14px] font-semibold text-text-primary">
                Top Customers
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              {topCustomers.length === 0 ? (
                <p className="text-[13px] text-text-muted py-4">
                  No customer data yet.
                </p>
              ) : (
                <div className="space-y-0">
                  {topCustomers.map((c, idx) => (
                    <a
                      key={c.id}
                      href={`/customers?customer=${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 w-full py-2.5 px-2 -mx-2 rounded-lg hover:bg-surface-elevated transition-colors text-left"
                    >
                      <span className="text-[12px] font-medium text-text-muted w-5 text-center tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-text-primary truncate">
                          {c.full_name || c.email || "Unknown"}
                        </p>
                        {c.email && c.full_name && (
                          <p className="text-[11px] text-text-muted truncate">
                            {c.email}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {c.sources.slice(0, 3).map((s) => (
                            <span
                              key={s}
                              className="inline-block w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: SOURCE_COLORS[s] ?? "#94a3b8",
                              }}
                              title={SOURCE_LABELS[s] ?? s}
                            />
                          ))}
                        </div>
                        <span className="text-[13px] font-semibold text-text-primary tabular-nums">
                          $
                          {c.totalRevenue.toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
