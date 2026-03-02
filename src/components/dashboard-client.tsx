"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    params.set("insight", result.drilldownFilter.type);
    if (result.drilldownFilter.value) {
      params.set("value", result.drilldownFilter.value);
    }
    if (config.profile_id) {
      params.set("profile", config.profile_id);
    }
    // Prefill manual filter dropdowns to match the insight drilldown
    if (result.drilldownFilter.type === "repeat_customers") {
      params.set("repeat", "repeat");
    }
    if (result.drilldownFilter.type === "channel" && result.drilldownFilter.value) {
      params.set("channel", result.drilldownFilter.value);
    }
    router.push(`/customers?${params.toString()}`);
  };

  return (
    <div
      className={`p-8 max-w-[1400px] ${showAnimation ? "animate-fade-in" : ""}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
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

      {/* Insight Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {insightResults.map((result, idx) => (
          <Card
            key={result.id}
            className={`border-border-default shadow-none transition-colors group ${
              result.disabled
                ? "opacity-60 cursor-default"
                : "cursor-pointer hover:border-border-default hover:bg-surface-elevated/50"
            } ${showAnimation ? `animate-fade-in-up stagger-${idx + 1}` : ""}`}
            onClick={() => handleInsightClick(result)}
          >
            <CardContent className="px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-medium text-text-muted">
                  {result.title}
                </p>
                <Badge
                  variant="secondary"
                  className={`text-[10px] font-medium px-1.5 py-0 ${
                    CATEGORY_STYLES[result.category] ?? ""
                  }`}
                >
                  {result.category}
                </Badge>
              </div>
              <div className="text-xl font-semibold tracking-[-0.02em] text-text-primary tabular-nums">
                {result.primaryValue}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 tabular-nums">
                {result.secondaryValue}
              </p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-muted">
                <p className="text-[11px] text-text-muted leading-snug max-w-[85%]">
                  {result.description}
                </p>
                {!result.disabled && (
                  <ArrowRight className="h-3 w-3 text-text-muted group-hover:text-text-secondary transition-colors shrink-0" />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Trend Chart */}
      <Card className="border-border-default shadow-none mb-6">
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

      {/* Two columns: Top Customers + Revenue by Source */}
      <div className="flex gap-4">
        {/* Left: Top 5 Customers */}
        <Card className="flex-[3] border-border-default shadow-none">
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

        {/* Right: Revenue by Source */}
        <Card className="flex-[2] border-border-default shadow-none">
          <CardHeader className="px-6 pt-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-text-primary">
              Revenue by Source
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-5">
            {revenueBySource.length === 0 ? (
              <p className="text-[13px] text-text-muted py-4">
                No revenue data yet.
              </p>
            ) : (
              <div className="space-y-3">
                {revenueBySource.map((item) => {
                  const color = SOURCE_COLORS[item.source] ?? "#94a3b8";
                  return (
                    <div key={item.source}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-[13px] font-medium text-text-primary">
                            {SOURCE_LABELS[item.source] ?? item.source}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-text-primary tabular-nums">
                            $
                            {item.revenue.toLocaleString("en-US", {
                              minimumFractionDigits: 0,
                            })}
                          </span>
                          <span className="text-[11px] text-text-muted tabular-nums w-10 text-right">
                            {item.percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
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
      </div>
    </div>
  );
}
