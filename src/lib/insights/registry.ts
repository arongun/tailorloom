import type {
  InsightCardDefinition,
  ComputedCustomer,
  ResolvedConfig,
  InsightResult,
} from "./types";
import {
  isWinBackTarget,
  isOneAndDoneRisk,
  isNewHighValue,
} from "./metrics";

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`;
  }
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

// ── Row 1: Action Required ──────────────────────────────────

const winBack: InsightCardDefinition = {
  id: "win_back",
  title: "Retention",
  description: "Tier A customers past the at-risk threshold — high LTV at stake",
  category: "Retention",
  metricType: "count",
  thresholds: {},
  drilldownFilter: { type: "win_back", label: "Retention Targets" },
  compute: (
    customers: ComputedCustomer[],
    config: ResolvedConfig
  ): InsightResult => {
    const filtered = customers.filter((c) => isWinBackTarget(c, config));
    const ltvAtStake = filtered.reduce((acc, c) => acc + c.lifetime_revenue, 0);

    return {
      id: "win_back",
      title: "Retention",
      description:
        "Tier A customers past the at-risk threshold — high LTV at stake",
      category: "Retention",
      primaryValue: `${filtered.length}`,
      secondaryValue: `${formatCurrency(ltvAtStake)} LTV at stake`,
      delta: null,
      drilldownFilter: { type: "win_back", label: "Retention Targets" },
      row: 1,
    };
  },
};

const oneAndDone: InsightCardDefinition = {
  id: "one_and_done",
  title: "Risk",
  description: "Single-purchase customers going cold — convert or lose them",
  category: "Risk",
  metricType: "count",
  thresholds: {},
  drilldownFilter: { type: "one_and_done", label: "At-Risk Customers" },
  compute: (
    customers: ComputedCustomer[],
    config: ResolvedConfig
  ): InsightResult => {
    const filtered = customers.filter((c) => isOneAndDoneRisk(c, config));
    const revenue = filtered.reduce((acc, c) => acc + c.lifetime_revenue, 0);

    return {
      id: "one_and_done",
      title: "Risk",
      description:
        "Single-purchase customers going cold — convert or lose them",
      category: "Risk",
      primaryValue: `${filtered.length}`,
      secondaryValue: `${formatCurrency(revenue)} in this group`,
      delta: null,
      drilldownFilter: { type: "one_and_done", label: "At-Risk Customers" },
      row: 1,
    };
  },
};

const newHighValue: InsightCardDefinition = {
  id: "new_high_value",
  title: "Growth",
  description: "Recently acquired Tier A customers — nurture to retain",
  category: "Growth",
  metricType: "count",
  thresholds: {},
  drilldownFilter: { type: "new_high_value", label: "Growth Customers" },
  compute: (
    customers: ComputedCustomer[],
    config: ResolvedConfig
  ): InsightResult => {
    const filtered = customers.filter((c) => isNewHighValue(c, config));
    const revenue = filtered.reduce((acc, c) => acc + c.lifetime_revenue, 0);

    return {
      id: "new_high_value",
      title: "Growth",
      description:
        "Recently acquired Tier A customers — nurture to retain",
      category: "Growth",
      primaryValue: `${filtered.length}`,
      secondaryValue: `${formatCurrency(revenue)} from this group`,
      delta: null,
      drilldownFilter: { type: "new_high_value", label: "Growth Customers" },
      row: 1,
    };
  },
};

// ── Row 2: Intelligence ─────────────────────────────────────

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
    const channelTotals: Record<string, number> = {};
    for (const customer of customers) {
      for (const [channel, revenue] of Object.entries(
        customer.channel_revenue
      )) {
        channelTotals[channel] = (channelTotals[channel] ?? 0) + revenue;
      }
    }

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
      row: 2,
    };
  },
};

const revenueConcentration: InsightCardDefinition = {
  id: "revenue_concentration",
  title: "Revenue Concentration",
  description: "How concentrated is Tier A revenue across channels",
  category: "Growth",
  metricType: "percent",
  thresholds: {},
  drilldownFilter: { type: "channel", label: "All Channels" },
  compute: (
    customers: ComputedCustomer[],
    _config: ResolvedConfig
  ): InsightResult => {
    // Only Tier A customers
    const tierA = customers.filter((c) => c.revenue_tier === "Tier A");
    const channelTotals: Record<string, number> = {};
    for (const customer of tierA) {
      for (const [channel, revenue] of Object.entries(
        customer.channel_revenue
      )) {
        channelTotals[channel] = (channelTotals[channel] ?? 0) + revenue;
      }
    }

    const sorted = Object.entries(channelTotals).sort((a, b) => b[1] - a[1]);
    const topChannel = sorted[0];
    const totalAttributed = sorted.reduce((sum, [, rev]) => sum + rev, 0);
    const topPct =
      topChannel && totalAttributed > 0
        ? Math.round((topChannel[1] / totalAttributed) * 100)
        : 0;
    const noData = sorted.length === 0;

    return {
      id: "revenue_concentration",
      title: "Revenue Concentration",
      description: "How concentrated is Tier A revenue across channels",
      category: "Growth",
      primaryValue: topChannel ? `${topPct}%` : "–",
      secondaryValue: topChannel
        ? `of Tier A revenue — ${topChannel[0]}`
        : "No Tier A channel data",
      delta: null,
      drilldownFilter: {
        type: "channel",
        value: topChannel?.[0] ?? "",
        label: topChannel ? `Channel: ${topChannel[0]}` : "All Channels",
      },
      disabled: noData,
      row: 2,
    };
  },
};

// ── Registry ─────────────────────────────────────────────────

export const INSIGHT_CARDS: InsightCardDefinition[] = [
  winBack,
  oneAndDone,
  newHighValue,
  channelRevenue,
  revenueConcentration,
];
