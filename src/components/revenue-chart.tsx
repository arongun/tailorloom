"use client";

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

interface RevenueChartProps {
  data: { month: string; revenue: number; purchases: number }[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
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

export function RevenueChart({ data }: RevenueChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const strokeColor = isDark ? "#e2e8f0" : "#0f172a";
  const gridColor = isDark ? "#334155" : "#e2e8f0";
  const tickColor = isDark ? "#94a3b8" : "#94a3b8";
  const dotStrokeColor = isDark ? "#1e293b" : "#fff";

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
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={gridColor}
            vertical={false}
          />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: tickColor }}
            dy={8}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: tickColor }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            dx={-4}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={strokeColor}
            strokeWidth={2}
            fill="url(#revenueGradient)"
            dot={false}
            activeDot={{
              r: 5,
              fill: strokeColor,
              stroke: dotStrokeColor,
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
