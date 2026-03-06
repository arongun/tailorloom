import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ComputedCustomer,
  RevenueTier,
  RiskStatus,
  ResolvedConfig,
} from "./types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// ── Shared predicates (used by both cards and table drilldown) ────

export function isRevenueAtRisk(
  customer: ComputedCustomer,
  config: ResolvedConfig
): boolean {
  return (
    customer.lifetime_revenue > config.revenue_at_risk_min_ltv &&
    customer.days_since_last_activity !== null &&
    customer.days_since_last_activity > config.at_risk_days
  );
}

export function isRepeatCustomer(customer: ComputedCustomer): boolean {
  return customer.repeat_flag;
}

export function isInChannel(
  customer: ComputedCustomer,
  channel: string
): boolean {
  return channel in customer.channel_revenue;
}

export function isWinBackTarget(
  customer: ComputedCustomer,
  config: ResolvedConfig
): boolean {
  return (
    customer.revenue_tier === "Tier A" &&
    customer.days_since_last_activity !== null &&
    customer.days_since_last_activity >= config.at_risk_days
  );
}

export function isOneAndDoneRisk(
  customer: ComputedCustomer,
  config: ResolvedConfig
): boolean {
  return (
    customer.purchase_count === 1 &&
    customer.days_since_last_activity !== null &&
    customer.days_since_last_activity >= config.one_and_done_days
  );
}

export function isNewHighValue(
  customer: ComputedCustomer,
  config: ResolvedConfig
): boolean {
  return (
    customer.revenue_tier === "Tier A" &&
    customer.days_since_first_payment !== null &&
    customer.days_since_first_payment <= config.new_high_value_window_days
  );
}

// ── Classification helpers ───────────────────────────────────────

export function computeRevenueTier(
  lifetimeRevenue: number,
  config: ResolvedConfig
): RevenueTier {
  if (lifetimeRevenue >= config.high_value_threshold) return "Tier A";
  if (lifetimeRevenue >= config.tier_b_min) return "Tier B";
  return "Tier C";
}

export function computeRiskStatus(
  daysSinceLastActivity: number | null,
  config: ResolvedConfig
): RiskStatus {
  if (daysSinceLastActivity === null) return "Lost";
  if (daysSinceLastActivity >= config.lost_days) return "Lost";
  if (daysSinceLastActivity >= config.dormant_days) return "Dormant";
  if (daysSinceLastActivity >= config.at_risk_days) return "At Risk";
  return "Healthy";
}

// ── Helpers ──────────────────────────────────────────────────────

export function maxDate(...dates: (string | null | undefined)[]): string | null {
  let max: string | null = null;
  for (const d of dates) {
    if (d && (!max || d > max)) max = d;
  }
  return max;
}

export function minDate(...dates: (string | null | undefined)[]): string | null {
  let min: string | null = null;
  for (const d of dates) {
    if (d && (!min || d < min)) min = d;
  }
  return min;
}

// ── Main computation ─────────────────────────────────────────────

export async function computeAllCustomerMetrics(
  config: ResolvedConfig
): Promise<ComputedCustomer[]> {
  const admin = createAdminClient();
  const now = new Date();

  // 4 parallel queries, all filtered by org_id
  const [customersRes, paymentsRes, bookingsRes, attendanceRes] =
    await Promise.all([
      admin
        .from("customers")
        .select("id, full_name, email")
        .eq("org_id", DEFAULT_ORG_ID),
      admin
        .from("payments")
        .select("customer_id, amount, amount_usd, payment_date, source")
        .eq("org_id", DEFAULT_ORG_ID)
        .in("status", ["succeeded", "approved"]),
      admin
        .from("bookings")
        .select(
          "customer_id, start_time, status, source, lead_source_channel"
        )
        .eq("org_id", DEFAULT_ORG_ID),
      admin
        .from("attendance")
        .select("customer_id, check_in_time")
        .eq("org_id", DEFAULT_ORG_ID),
    ]);

  const customers = customersRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const bookings = bookingsRes.data ?? [];
  const attendance = attendanceRes.data ?? [];

  // Aggregate payments per customer
  const paymentAgg = new Map<
    string,
    {
      total: number;
      count: number;
      lastDate: string | null;
      firstDate: string | null;
      bySource: Map<string, number>;
    }
  >();
  for (const p of payments) {
    if (!p.customer_id) continue;
    if (p.amount_usd == null) continue; // Skip payments without FX conversion
    const agg = paymentAgg.get(p.customer_id) ?? {
      total: 0,
      count: 0,
      lastDate: null,
      firstDate: null,
      bySource: new Map(),
    };
    const amount = Number(p.amount_usd) || 0;
    agg.total += amount;
    agg.count += 1;
    agg.lastDate = maxDate(agg.lastDate, p.payment_date);
    agg.firstDate = minDate(agg.firstDate, p.payment_date);
    const source = p.source || "manual";
    agg.bySource.set(source, (agg.bySource.get(source) ?? 0) + amount);
    paymentAgg.set(p.customer_id, agg);
  }

  // Aggregate bookings per customer
  const bookingAgg = new Map<
    string,
    {
      count: number;
      lastDate: string | null;
      channels: Set<string>;
    }
  >();
  for (const b of bookings) {
    if (!b.customer_id) continue;
    const agg = bookingAgg.get(b.customer_id) ?? {
      count: 0,
      lastDate: null,
      channels: new Set(),
    };
    // Only count completed/confirmed bookings for booking_count
    if (b.status === "completed" || b.status === "confirmed") {
      agg.count += 1;
    }
    agg.lastDate = maxDate(agg.lastDate, b.start_time);
    if (b.lead_source_channel) {
      agg.channels.add(b.lead_source_channel);
    }
    bookingAgg.set(b.customer_id, agg);
  }

  // Aggregate attendance per customer
  const lastAttendance = new Map<string, string>();
  for (const a of attendance) {
    if (!a.customer_id) continue;
    const existing = lastAttendance.get(a.customer_id);
    if (!existing || a.check_in_time > existing) {
      lastAttendance.set(a.customer_id, a.check_in_time);
    }
  }

  // Compute per customer
  return customers.map((c) => {
    const payInfo = paymentAgg.get(c.id);
    const bookInfo = bookingAgg.get(c.id);
    const lifetime_revenue = Math.round((payInfo?.total ?? 0) * 100) / 100;
    const purchase_count = payInfo?.count ?? 0;
    const booking_count = bookInfo?.count ?? 0;

    const last_activity_date = maxDate(
      payInfo?.lastDate,
      bookInfo?.lastDate,
      lastAttendance.get(c.id)
    );

    const days_since_last_activity =
      last_activity_date !== null
        ? Math.floor(
            (now.getTime() - new Date(last_activity_date).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null;

    const revenue_tier = computeRevenueTier(lifetime_revenue, config);
    const risk_status = computeRiskStatus(days_since_last_activity, config);
    const repeat_flag =
      purchase_count + booking_count >= config.repeat_purchase_min;

    // Primary source: source with highest payment revenue, alphabetical tie-break
    let primary_source: string | null = null;
    if (payInfo && payInfo.bySource.size > 0) {
      const sorted = Array.from(payInfo.bySource.entries()).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      });
      primary_source = sorted[0][0];
    }

    // Channel revenue: attribute customer's LTV to each channel they have bookings from
    const channel_revenue: Record<string, number> = {};
    if (bookInfo && bookInfo.channels.size > 0) {
      for (const ch of bookInfo.channels) {
        channel_revenue[ch] = lifetime_revenue;
      }
    }

    // Phase 2: first payment date + days since
    const first_payment_date = payInfo?.firstDate ?? null;
    const days_since_first_payment =
      first_payment_date !== null
        ? Math.floor(
            (now.getTime() - new Date(first_payment_date).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null;

    // Phase 2: revenue by source
    const revenue_by_source: Record<string, number> = {};
    if (payInfo) {
      for (const [src, amt] of payInfo.bySource) {
        revenue_by_source[src] = Math.round(amt * 100) / 100;
      }
    }

    return {
      id: c.id,
      full_name: c.full_name,
      email: c.email,
      lifetime_revenue,
      purchase_count,
      booking_count,
      last_activity_date,
      days_since_last_activity,
      revenue_tier,
      risk_status,
      repeat_flag,
      primary_source,
      channel_revenue,
      first_payment_date,
      days_since_first_payment,
      revenue_by_source,
    };
  });
}
