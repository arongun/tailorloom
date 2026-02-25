"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Settings2,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/animated-number";
import { RevenueChart } from "@/components/revenue-chart";
import { DateRangePicker } from "@/components/date-range-picker";
import { useDateRange } from "@/app/(dashboard)/dashboard-context";
import {
  updateInsightConfig,
  getDashboardMetrics,
  getRevenueTrend,
  getRevenueBySource,
  getTopCustomers,
} from "@/lib/actions/dashboard";
import type {
  DashboardMetrics,
  RevenueTrendData,
  RevenueBySourceItem,
  TopCustomer,
  InsightConfigData,
  DateRangeParam,
} from "@/lib/actions/dashboard";

interface DashboardClientProps {
  initialConfig: InsightConfigData;
  initialMetrics: DashboardMetrics;
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

export function DashboardClient({
  initialConfig,
  initialMetrics,
  initialTrend,
  initialTopCustomers,
  initialRevenueBySource,
}: DashboardClientProps) {
  const { dateRange } = useDateRange();
  const [churnThreshold, setChurnThreshold] = useState(initialConfig.churn_days);
  const [highValueThreshold, setHighValueThreshold] = useState(initialConfig.high_value_threshold);
  const [metrics, setMetrics] = useState<DashboardMetrics>(initialMetrics);
  const [trendData, setTrendData] = useState<RevenueTrendData>(initialTrend);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>(initialTopCustomers);
  const [revenueBySource, setRevenueBySource] = useState<RevenueBySourceItem[]>(initialRevenueBySource);
  const [chartMode, setChartMode] = useState<"total" | "bySource">("total");
  const [savingConfig, setSavingConfig] = useState(false);
  const [loading, setLoading] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAnimated = useRef(false);
  const showAnimation = !hasAnimated.current;

  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  // Refetch all data when dateRange changes — incremental updates
  const pendingCount = useRef(0);

  useEffect(() => {
    const dateRangeParam: DateRangeParam | undefined =
      dateRange.from
        ? { from: dateRange.from.toISOString(), to: dateRange.to?.toISOString() ?? null }
        : undefined;

    pendingCount.current = 4;
    setLoading(true);

    // Fire all 4 fetches independently — update state as each resolves
    getDashboardMetrics(churnThreshold, highValueThreshold, dateRangeParam)
      .then(setMetrics)
      .catch(() => {})
      .finally(() => { if (--pendingCount.current === 0) setLoading(false); });

    getRevenueTrend(dateRangeParam)
      .then(setTrendData)
      .catch(() => {})
      .finally(() => { if (--pendingCount.current === 0) setLoading(false); });

    getTopCustomers(dateRangeParam)
      .then(setTopCustomers)
      .catch(() => {})
      .finally(() => { if (--pendingCount.current === 0) setLoading(false); });

    getRevenueBySource(dateRangeParam)
      .then(setRevenueBySource)
      .catch(() => {})
      .finally(() => { if (--pendingCount.current === 0) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const handleSliderCommit = useCallback(
    (newChurn: number, newHighValue: number) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(async () => {
        setSavingConfig(true);
        try {
          const dateRangeParam: DateRangeParam | undefined =
            dateRange.from
              ? { from: dateRange.from.toISOString(), to: dateRange.to?.toISOString() ?? null }
              : undefined;
          await Promise.all([
            updateInsightConfig(newChurn, newHighValue),
            getDashboardMetrics(newChurn, newHighValue, dateRangeParam).then(setMetrics),
          ]);
        } catch {} finally {
          setSavingConfig(false);
        }
      }, 500);
    },
    [dateRange]
  );

  const handleChurnCommit = (values: number[]) => handleSliderCommit(values[0], highValueThreshold);
  const handleHighValueCommit = (values: number[]) => handleSliderCommit(churnThreshold, values[0]);

  const metricCards = [
    {
      title: "Active Customers",
      value: metrics.activeCustomers,
      icon: Users,
      iconBg: "bg-surface-muted",
      iconColor: "text-text-secondary",
    },
    {
      title: "At-Risk",
      value: metrics.atRiskCustomers,
      icon: AlertTriangle,
      iconBg: "bg-amber-50 dark:bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
      alert: metrics.atRiskCustomers > 0,
    },
    {
      title: "High-Value",
      value: metrics.highValueCustomers,
      icon: TrendingUp,
      iconBg: "bg-emerald-50 dark:bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Purchase Freq.",
      value: metrics.purchaseFrequency,
      decimals: 1,
      suffix: "x",
      icon: ShoppingCart,
      iconBg: "bg-rose-50 dark:bg-rose-500/10",
      iconColor: "text-rose-600 dark:text-rose-400",
    },
  ];

  return (
    <div className={`p-8 max-w-[1400px] ${showAnimation ? "animate-fade-in" : ""}`}>
      {/* Row 1 — Header */}
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
          {loading && <Loader2 className="h-4 w-4 text-text-muted animate-spin" />}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center justify-center h-[34px] w-[34px] rounded-lg border border-border-default bg-surface text-text-muted hover:text-text-secondary transition-colors">
                <Settings2 className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="end" sideOffset={8}>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-text-primary">
                    Intelligence Parameters
                  </span>
                  {savingConfig && <Loader2 className="h-3.5 w-3.5 text-text-muted animate-spin" />}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] text-text-muted">Churn threshold</label>
                    <Badge variant="secondary" className="text-[11px] font-mono">
                      {churnThreshold}d
                    </Badge>
                  </div>
                  <Slider
                    value={[churnThreshold]}
                    onValueChange={(v) => setChurnThreshold(v[0])}
                    onValueCommit={handleChurnCommit}
                    min={30}
                    max={180}
                    step={5}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] text-text-muted">High-value threshold</label>
                    <Badge variant="secondary" className="text-[11px] font-mono">
                      ${highValueThreshold.toLocaleString()}
                    </Badge>
                  </div>
                  <Slider
                    value={[highValueThreshold]}
                    onValueChange={(v) => setHighValueThreshold(v[0])}
                    onValueCommit={handleHighValueCommit}
                    min={100}
                    max={20000}
                    step={100}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <DateRangePicker />
        </div>
      </div>

      {/* Row 2 — Metrics strip */}
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-4 mb-6">
        {/* Total Revenue */}
        <Card className="border-border-default shadow-none">
          <CardContent className="p-4">
            <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase mb-2">
              Total Revenue
            </p>
            <div className="text-xl font-semibold tracking-[-0.02em] text-text-primary tabular-nums">
              <AnimatedNumber value={metrics.totalRevenue} prefix="$" decimals={0} />
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              {metrics.revenueChange >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="h-3 w-3 text-rose-600 dark:text-rose-400" />
              )}
              <Badge
                variant="secondary"
                className={`text-[10px] font-medium px-1.5 py-0 ${
                  metrics.revenueChange >= 0
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    : "bg-rose-50 text-rose-700 hover:bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/10"
                }`}
              >
                {metrics.revenueChange >= 0 ? "+" : ""}
                {metrics.revenueChange.toFixed(1)}%
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* 4 metric cards */}
        {metricCards.map((card) => (
          <Card key={card.title} className="border-border-default shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">
                  {card.title}
                </p>
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${card.iconBg}`}>
                  <card.icon className={`h-3.5 w-3.5 ${card.iconColor}`} strokeWidth={2} />
                </div>
              </div>
              <div className={`text-xl font-semibold tracking-[-0.02em] text-text-primary ${card.alert ? "text-amber-600 dark:text-amber-400" : ""}`}>
                <AnimatedNumber value={card.value} suffix={card.suffix} decimals={card.decimals || 0} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 3 — Revenue Trend Chart */}
      <Card className="border-border-default shadow-none mb-6">
        <CardHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-[14px] font-semibold text-text-primary">
                Revenue Trend
              </CardTitle>
              <p className="text-[12px] text-text-muted mt-0.5">
                {trendData.interval === "day" ? "Daily" : trendData.interval === "week" ? "Weekly" : "Monthly"} revenue over time
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

      {/* Row 4 — Two columns */}
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
              <p className="text-[13px] text-text-muted py-4">No customer data yet.</p>
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
                        <p className="text-[11px] text-text-muted truncate">{c.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {c.sources.slice(0, 3).map((s) => (
                          <span
                            key={s}
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: SOURCE_COLORS[s] ?? "#94a3b8" }}
                            title={SOURCE_LABELS[s] ?? s}
                          />
                        ))}
                      </div>
                      <span className="text-[13px] font-semibold text-text-primary tabular-nums">
                        ${c.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0 })}
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
              <p className="text-[13px] text-text-muted py-4">No revenue data yet.</p>
            ) : (
              <div className="space-y-3">
                {revenueBySource.map((item) => {
                  const color = SOURCE_COLORS[item.source] ?? "#94a3b8";
                  return (
                    <div key={item.source}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-[13px] font-medium text-text-primary">
                            {SOURCE_LABELS[item.source] ?? item.source}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-text-primary tabular-nums">
                            ${item.revenue.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                          </span>
                          <span className="text-[11px] text-text-muted tabular-nums w-10 text-right">
                            {item.percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${item.percentage}%`, backgroundColor: color }}
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
