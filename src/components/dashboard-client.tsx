"use client";

import { useState, useRef, useCallback } from "react";
import {
  DollarSign,
  Users,
  AlertTriangle,
  TrendingUp,
  ShoppingCart,
  ChevronDown,
  Settings2,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnimatedNumber } from "@/components/animated-number";
import { RevenueChart } from "@/components/revenue-chart";
import {
  updateInsightConfig,
  getDashboardMetrics,
  getRevenueTrend,
} from "@/lib/actions/dashboard";
import type {
  DashboardMetrics,
  RevenueTrendPoint,
  InsightConfigData,
} from "@/lib/actions/dashboard";

interface DashboardClientProps {
  initialConfig: InsightConfigData;
  initialMetrics: DashboardMetrics;
  initialTrend: RevenueTrendPoint[];
}

type TrendRange = "3mo" | "6mo" | "12mo" | "all";

const RANGE_LABELS: Record<TrendRange, string> = {
  "3mo": "3 months",
  "6mo": "6 months",
  "12mo": "12 months",
  all: "All time",
};

export function DashboardClient({
  initialConfig,
  initialMetrics,
  initialTrend,
}: DashboardClientProps) {
  const [churnThreshold, setChurnThreshold] = useState(
    initialConfig.churn_days
  );
  const [highValueThreshold, setHighValueThreshold] = useState(
    initialConfig.high_value_threshold
  );
  const [metrics, setMetrics] = useState<DashboardMetrics>(initialMetrics);
  const [trendData, setTrendData] =
    useState<RevenueTrendPoint[]>(initialTrend);
  const [trendRange, setTrendRange] = useState<TrendRange>("12mo");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [loadingTrend, setLoadingTrend] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save config + refresh metrics on slider release
  const handleSliderCommit = useCallback(
    (newChurn: number, newHighValue: number) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      debounceTimer.current = setTimeout(async () => {
        setSavingConfig(true);
        try {
          await Promise.all([
            updateInsightConfig(newChurn, newHighValue),
            getDashboardMetrics(newChurn, newHighValue).then(setMetrics),
          ]);
        } catch {
          // Silently fail — metrics will be stale but functional
        } finally {
          setSavingConfig(false);
        }
      }, 500);
    },
    []
  );

  const handleChurnCommit = (values: number[]) => {
    handleSliderCommit(values[0], highValueThreshold);
  };

  const handleHighValueCommit = (values: number[]) => {
    handleSliderCommit(churnThreshold, values[0]);
  };

  // Revenue chart range change
  const handleRangeChange = async (value: string) => {
    const range = value as TrendRange;
    setTrendRange(range);
    setLoadingTrend(true);
    try {
      const data = await getRevenueTrend(range);
      setTrendData(data);
    } catch {
      // Keep existing data on error
    } finally {
      setLoadingTrend(false);
    }
  };

  const cards = [
    {
      title: "Total Revenue",
      value: metrics.totalRevenue,
      prefix: "$",
      decimals: 0,
      change: metrics.revenueChange,
      icon: DollarSign,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      title: "Active Customers",
      value: metrics.activeCustomers,
      icon: Users,
      iconBg: "bg-surface-muted",
      iconColor: "text-text-secondary",
    },
    {
      title: "At-Risk Customers",
      value: metrics.atRiskCustomers,
      icon: AlertTriangle,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      alert: metrics.atRiskCustomers > 5,
    },
    {
      title: "High-Value Customers",
      value: metrics.highValueCustomers,
      icon: TrendingUp,
      iconBg: "bg-surface-muted",
      iconColor: "text-text-secondary",
    },
    {
      title: "Purchase Frequency",
      value: metrics.purchaseFrequency,
      decimals: 1,
      suffix: " / customer",
      icon: ShoppingCart,
      iconBg: "bg-rose-50",
      iconColor: "text-rose-600",
    },
  ];

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          Dashboard
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Revenue overview and customer intelligence
        </p>
      </div>

      {/* Insight Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {cards.map((card, idx) => (
          <Card
            key={card.title}
            className={`animate-fade-in-up stagger-${idx + 1} border-border-default shadow-none hover:shadow-sm transition-shadow duration-200`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5">
              <CardTitle className="text-[11px] font-medium tracking-wide text-text-muted uppercase">
                {card.title}
              </CardTitle>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.iconBg}`}
              >
                <card.icon
                  className={`h-4 w-4 ${card.iconColor}`}
                  strokeWidth={2}
                />
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
                <AnimatedNumber
                  value={card.value}
                  prefix={card.prefix}
                  suffix={card.suffix}
                  decimals={card.decimals || 0}
                />
              </div>
              {card.change !== undefined && (
                <div className="mt-2 flex items-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className={`text-[11px] font-medium px-1.5 py-0 ${
                      card.change >= 0
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                        : "bg-rose-50 text-rose-700 hover:bg-rose-50"
                    }`}
                  >
                    {card.change >= 0 ? "+" : ""}
                    {card.change.toFixed(1)}%
                  </Badge>
                  <span className="text-[11px] text-text-muted">
                    vs prior period
                  </span>
                </div>
              )}
              {card.alert && (
                <p className="mt-2 text-[11px] text-amber-600 font-medium">
                  Requires attention
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Settings Panel */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <CollapsibleTrigger className="mb-4 flex w-full items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-3 text-left hover:bg-surface-elevated transition-colors animate-fade-in stagger-5">
          <Settings2 className="h-4 w-4 text-text-muted" />
          <span className="text-[13px] font-medium text-text-secondary flex-1">
            Intelligence Parameters
          </span>
          {savingConfig && (
            <Loader2 className="h-3.5 w-3.5 text-text-muted animate-spin" />
          )}
          <ChevronDown
            className={`h-4 w-4 text-text-muted transition-transform duration-200 ${
              settingsOpen ? "rotate-180" : ""
            }`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mb-6 border-border-default shadow-none">
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-[13px] font-medium text-text-secondary">
                      Churn Threshold
                    </label>
                    <Badge
                      variant="secondary"
                      className="text-[12px] font-mono"
                    >
                      {churnThreshold} days
                    </Badge>
                  </div>
                  <Slider
                    value={[churnThreshold]}
                    onValueChange={(v) => setChurnThreshold(v[0])}
                    onValueCommit={handleChurnCommit}
                    min={30}
                    max={180}
                    step={5}
                    className="w-full"
                  />
                  <p className="mt-2 text-[11px] text-text-muted">
                    Days since last activity before a customer is flagged as
                    at-risk
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-[13px] font-medium text-text-secondary">
                      High-Value Threshold
                    </label>
                    <Badge
                      variant="secondary"
                      className="text-[12px] font-mono"
                    >
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
                    className="w-full"
                  />
                  <p className="mt-2 text-[11px] text-text-muted">
                    Minimum total revenue to classify a customer as high-value
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Revenue Chart */}
      <Card className="border-border-default shadow-none animate-fade-in-up stagger-5">
        <CardHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-[14px] font-semibold text-text-primary">
                Revenue Trend
              </CardTitle>
              <p className="text-[12px] text-text-muted mt-0.5">
                Monthly revenue over time
              </p>
            </div>
            <div className="flex items-center gap-2">
              {loadingTrend && (
                <Loader2 className="h-3.5 w-3.5 text-text-muted animate-spin" />
              )}
              <Select value={trendRange} onValueChange={handleRangeChange}>
                <SelectTrigger className="w-[130px] text-[12px] h-8 border-border-default bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3mo">3 months</SelectItem>
                  <SelectItem value="6mo">6 months</SelectItem>
                  <SelectItem value="12mo">12 months</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-2">
          <RevenueChart data={trendData} />
        </CardContent>
      </Card>
    </div>
  );
}
