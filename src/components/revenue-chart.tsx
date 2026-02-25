"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "next-themes";
import type { RevenueTrendBySourcePoint } from "@/lib/actions/dashboard";

interface RevenueChartProps {
  data: { label: string; revenue: number; purchases: number }[];
  mode?: "total" | "bySource";
  bySourceData?: RevenueTrendBySourcePoint[];
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

const SOURCES = ["stripe", "pos", "wetravel", "calendly", "passline", "manual"] as const;

function TotalTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border-default bg-surface px-4 py-3 shadow-lg">
      <p className="text-[11px] font-medium text-text-muted mb-1">{label}</p>
      <p className="text-[14px] font-semibold text-text-primary">
        ${payload[0].value.toLocaleString("en-US", { minimumFractionDigits: 0 })}
      </p>
    </div>
  );
}

function BySourceTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="rounded-lg border border-border-default bg-surface px-4 py-3 shadow-lg min-w-[160px]">
      <p className="text-[11px] font-medium text-text-muted mb-2">{label}</p>
      {payload
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 mb-0.5">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-[12px] text-text-secondary">{SOURCE_LABELS[entry.dataKey] ?? entry.dataKey}</span>
            </div>
            <span className="text-[12px] font-medium text-text-primary tabular-nums">
              ${entry.value.toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </span>
          </div>
        ))}
      <div className="border-t border-border-muted mt-1.5 pt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-text-muted">Total</span>
        <span className="text-[12px] font-semibold text-text-primary tabular-nums">
          ${total.toLocaleString("en-US", { minimumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}

function formatYAxis(value: number): string {
  if (value === 0) return "$0";
  if (value >= 1000) {
    const k = value / 1000;
    return k % 1 === 0 ? `$${k}k` : `$${k.toFixed(1)}k`;
  }
  return `$${value}`;
}

export function RevenueChart({ data, mode = "total", bySourceData }: RevenueChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Enable animation only after first render so mount is instant,
  // but subsequent data changes get smooth transitions
  const [animateEnabled, setAnimateEnabled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimateEnabled(true), 150);
    return () => clearTimeout(t);
  }, []);

  const strokeColor = isDark ? "#e2e8f0" : "#0f172a";
  const gridColor = isDark ? "#334155" : "#e2e8f0";
  const tickColor = isDark ? "#94a3b8" : "#94a3b8";
  const dotStrokeColor = isDark ? "#1e293b" : "#fff";

  // Show ~12-15 evenly spaced labels max; if fewer points, show all
  const MAX_TICKS = 14;
  const activeData = mode === "bySource" && bySourceData ? bySourceData : data;
  const tickInterval = activeData.length <= MAX_TICKS ? 0 : Math.ceil(activeData.length / MAX_TICKS) - 1;

  if (mode === "bySource" && bySourceData) {
    return (
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bySourceData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {SOURCES.map((source) => (
                <linearGradient key={source} id={`gradient-${source}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SOURCE_COLORS[source]} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={SOURCE_COLORS[source]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: tickColor }} dy={8} interval={tickInterval} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: tickColor }} tickFormatter={formatYAxis} dx={-4} allowDecimals={false} domain={[0, "auto"]} />
            <Tooltip content={<BySourceTooltip />} />
            {SOURCES.map((source) => (
              <Area
                key={source}
                type="monotone"
                dataKey={source}
                stackId="1"
                stroke={SOURCE_COLORS[source]}
                strokeWidth={1.5}
                fill={`url(#gradient-${source})`}
                dot={false}
                isAnimationActive={animateEnabled}
                animationDuration={300}
                animationEasing="ease-in-out"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.08} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: tickColor }} dy={8} interval={tickInterval} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: tickColor }} tickFormatter={formatYAxis} dx={-4} allowDecimals={false} domain={[0, "auto"]} />
          <Tooltip content={<TotalTooltip />} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={strokeColor}
            strokeWidth={2}
            fill="url(#revenueGradient)"
            dot={false}
            activeDot={{ r: 5, fill: strokeColor, stroke: dotStrokeColor, strokeWidth: 2 }}
            isAnimationActive={animateEnabled}
            animationDuration={300}
            animationEasing="ease-in-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
