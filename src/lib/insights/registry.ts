import type {
  InsightCardDefinition,
  ComputedCustomer,
  ResolvedConfig,
  InsightResult,
} from "./types";
import { isRevenueAtRisk, isRepeatCustomer } from "./metrics";

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`;
  }
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

// ── Card 1: Revenue at Risk ──────────────────────────────────────

const revenueAtRisk: InsightCardDefinition = {
  id: "revenue_at_risk",
  title: "Revenue at Risk",
  description: "Lifetime revenue from customers who haven't engaged recently",
  category: "Retention",
  metricType: "currency",
  thresholds: { min_ltv: 500, min_inactive_days: 60 },
  drilldownFilter: { type: "revenue_at_risk", label: "Revenue at Risk" },
  compute: (
    customers: ComputedCustomer[],
    config: ResolvedConfig
  ): InsightResult => {
    const filtered = customers.filter((c) => isRevenueAtRisk(c, config));
    const sum = filtered.reduce((acc, c) => acc + c.lifetime_revenue, 0);

    return {
      id: "revenue_at_risk",
      title: "Revenue at Risk",
      description:
        "Lifetime revenue from customers who haven't engaged recently",
      category: "Retention",
      primaryValue: formatCurrency(sum),
      secondaryValue: `${filtered.length} customer${filtered.length !== 1 ? "s" : ""}`,
      delta: null,
      drilldownFilter: { type: "revenue_at_risk", label: "Revenue at Risk" },
    };
  },
};

// ── Card 2: Repeat Rate ──────────────────────────────────────────

const repeatRate: InsightCardDefinition = {
  id: "repeat_rate",
  title: "Repeat Rate",
  description: "Percentage of customers with 2+ purchases or bookings",
  category: "Retention",
  metricType: "percent",
  thresholds: { min_engagements: 2 },
  drilldownFilter: { type: "repeat_customers", label: "Repeat Customers" },
  compute: (
    customers: ComputedCustomer[],
    _config: ResolvedConfig
  ): InsightResult => {
    const total = customers.length;
    const repeats = customers.filter((c) => isRepeatCustomer(c));
    const rate = total > 0 ? Math.round((repeats.length / total) * 100) : 0;

    return {
      id: "repeat_rate",
      title: "Repeat Rate",
      description: "Percentage of customers with 2+ purchases or bookings",
      category: "Retention",
      primaryValue: `${rate}%`,
      secondaryValue: `${repeats.length} of ${total} customers`,
      delta: null,
      drilldownFilter: { type: "repeat_customers", label: "Repeat Customers" },
    };
  },
};

// ── Card 3: Channel Revenue ──────────────────────────────────────

const channelRevenue: InsightCardDefinition = {
  id: "channel_revenue",
  title: "Channel Revenue",
  description: "Revenue attributed by marketing channel",
  category: "Growth",
  metricType: "currency",
  thresholds: {},
  drilldownFilter: { type: "channel", label: "All Channels" },
  compute: (
    customers: ComputedCustomer[],
    _config: ResolvedConfig
  ): InsightResult => {
    // Aggregate all customers' channel_revenue into global map
    const channelTotals: Record<string, number> = {};
    for (const customer of customers) {
      for (const [channel, revenue] of Object.entries(
        customer.channel_revenue
      )) {
        channelTotals[channel] = (channelTotals[channel] ?? 0) + revenue;
      }
    }

    // Sort channels by revenue desc
    const sorted = Object.entries(channelTotals).sort((a, b) => b[1] - a[1]);
    const topChannel = sorted[0];
    const totalAttributed = sorted.reduce((sum, [, rev]) => sum + rev, 0);
    const noChannels = sorted.length === 0;

    return {
      id: "channel_revenue",
      title: "Channel Revenue",
      description: "Revenue attributed by marketing channel",
      category: "Growth",
      primaryValue: formatCurrency(totalAttributed),
      secondaryValue: topChannel
        ? `Top: ${topChannel[0]} (${sorted.length} channel${sorted.length !== 1 ? "s" : ""})`
        : "No attribution data",
      delta: null,
      drilldownFilter: {
        type: "channel",
        value: topChannel?.[0] ?? "",
        label: topChannel ? `Channel: ${topChannel[0]}` : "All Channels",
      },
      disabled: noChannels,
    };
  },
};

// ── Registry ─────────────────────────────────────────────────────

export const INSIGHT_CARDS: InsightCardDefinition[] = [
  revenueAtRisk,
  repeatRate,
  channelRevenue,
];
