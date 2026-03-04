// Revenue classification
export type RevenueTier = "Tier A" | "Tier B" | "Tier C";

// Risk classification — 4 levels
export type RiskStatus = "Healthy" | "At Risk" | "Dormant" | "Lost";

// Core computed model — one per customer, serializable via Next.js server->client
export interface ComputedCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  // Raw metrics
  lifetime_revenue: number;
  purchase_count: number; // succeeded/approved payments
  booking_count: number; // completed/confirmed bookings
  last_activity_date: string | null; // MAX(payment_date, booking start_time, attendance check_in_time)
  days_since_last_activity: number | null;
  // Derived (from config thresholds)
  revenue_tier: RevenueTier;
  risk_status: RiskStatus;
  repeat_flag: boolean; // (purchase_count + booking_count) >= repeat_purchase_min
  primary_source: string | null; // Source with highest payment revenue; tie = alphabetical; null = no payments
  // For Channel Revenue card — Record (not Map) for serialization
  channel_revenue: Record<string, number>; // channel name -> revenue attributed via bookings
  // Phase 2 additions
  first_payment_date: string | null;
  days_since_first_payment: number | null;
  revenue_by_source: Record<string, number>;
}

// Profile config — 4 required fields + Phase 1 extensions
export interface ProfileConfig {
  id: string;
  label: string;
  // 4 required fields
  churn_days: number;
  at_risk_days: number;
  high_value_threshold: number;
  repeat_purchase_min: number;
  // Phase 1 extensions
  dormant_days: number;
  lost_days: number;
  tier_b_min: number;
  // Derived-only field (NOT persisted in DB)
  revenue_at_risk_min_ltv: number;
  // Phase 2 extensions
  new_high_value_window_days: number;
  one_and_done_days: number;
}

// Resolved config after merging profile + DB overrides
export type ResolvedConfig = ProfileConfig & { profile_id: string };

// Insight card types
export type InsightCategory = "Retention" | "Growth" | "Ops" | "Action";
export type MetricType = "currency" | "percent" | "count";

export interface DrilldownFilter {
  type: string;
  value?: string;
  label: string;
}

export interface InsightResult {
  id: string;
  title: string;
  description: string;
  category: InsightCategory;
  primaryValue: string;
  secondaryValue: string;
  delta: number | null;
  drilldownFilter: DrilldownFilter;
  disabled?: boolean;
  row?: 1 | 2 | 3;
}

export interface InsightCardDefinition {
  id: string;
  title: string;
  description: string;
  category: InsightCategory;
  metricType: MetricType;
  thresholds: Record<string, number>;
  compute: (
    customers: ComputedCustomer[],
    config: ResolvedConfig
  ) => InsightResult;
  drilldownFilter: DrilldownFilter;
}
