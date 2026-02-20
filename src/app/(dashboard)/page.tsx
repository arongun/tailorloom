"use client";

import { useState, useMemo } from "react";
import {
  DollarSign,
  Users,
  AlertTriangle,
  TrendingUp,
  Heart,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AnimatedNumber } from "@/components/animated-number";
import {
  computeDashboardMetrics,
  getMonthlyRevenueTrend,
} from "@/lib/data/revenue-dashboard";
import { RevenueChart } from "@/components/revenue-chart";

export default function DashboardPage() {
  const [churnThreshold, setChurnThreshold] = useState(90);
  const [highValueThreshold, setHighValueThreshold] = useState(5000);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const metrics = useMemo(
    () => computeDashboardMetrics(churnThreshold, highValueThreshold),
    [churnThreshold, highValueThreshold]
  );

  const trendData = useMemo(() => getMonthlyRevenueTrend(), []);

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
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
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
      title: "Avg Revenue / Customer",
      value: metrics.avgRevenuePerCustomer,
      prefix: "$",
      decimals: 0,
      icon: TrendingUp,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
    },
    {
      title: "Customer Lifetime Value",
      value: metrics.clv,
      prefix: "$",
      decimals: 0,
      icon: Heart,
      iconBg: "bg-rose-50",
      iconColor: "text-rose-600",
    },
  ];

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
          Dashboard
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Revenue overview and customer intelligence
        </p>
      </div>

      {/* Insight Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {cards.map((card, idx) => (
          <Card
            key={card.title}
            className={`animate-fade-in-up stagger-${idx + 1} border-slate-200 shadow-none hover:shadow-sm transition-shadow duration-200`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5">
              <CardTitle className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
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
              <div className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
                <AnimatedNumber
                  value={card.value}
                  prefix={card.prefix}
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
                  <span className="text-[11px] text-slate-400">
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
        <CollapsibleTrigger className="mb-4 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 transition-colors animate-fade-in stagger-5">
          <Settings2 className="h-4 w-4 text-slate-400" />
          <span className="text-[13px] font-medium text-slate-700 flex-1">
            Intelligence Parameters
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
              settingsOpen ? "rotate-180" : ""
            }`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mb-6 border-slate-200 shadow-none">
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-[13px] font-medium text-slate-700">
                      Churn Threshold
                    </label>
                    <Badge variant="secondary" className="text-[12px] font-mono">
                      {churnThreshold} days
                    </Badge>
                  </div>
                  <Slider
                    value={[churnThreshold]}
                    onValueChange={(v) => setChurnThreshold(v[0])}
                    min={30}
                    max={180}
                    step={5}
                    className="w-full"
                  />
                  <p className="mt-2 text-[11px] text-slate-400">
                    Days since last purchase before a customer is flagged as
                    at-risk
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-[13px] font-medium text-slate-700">
                      High-Value Threshold
                    </label>
                    <Badge variant="secondary" className="text-[12px] font-mono">
                      ${highValueThreshold.toLocaleString()}
                    </Badge>
                  </div>
                  <Slider
                    value={[highValueThreshold]}
                    onValueChange={(v) => setHighValueThreshold(v[0])}
                    min={1000}
                    max={20000}
                    step={500}
                    className="w-full"
                  />
                  <p className="mt-2 text-[11px] text-slate-400">
                    Minimum total revenue to classify a customer as high-value
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Revenue Chart */}
      <Card className="border-slate-200 shadow-none animate-fade-in-up stagger-5">
        <CardHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-[14px] font-semibold text-slate-900">
                Revenue Trend
              </CardTitle>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Monthly revenue over the last 12 months
              </p>
            </div>
            <Badge variant="secondary" className="text-[11px]">
              Last 12 months
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-2">
          <RevenueChart data={trendData} />
        </CardContent>
      </Card>
    </div>
  );
}
