"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveConfig } from "@/lib/insights/config";
import {
  computeAllCustomerMetrics,
  computeRevenueTier,
  computeRiskStatus,
  maxDate,
} from "@/lib/insights/metrics";
import { INSIGHT_CARDS } from "@/lib/insights/registry";
import type {
  ComputedCustomer,
  ResolvedConfig,
  InsightResult,
} from "@/lib/insights/types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// ─── Types ─────────────────────────────────────────────────
// Types are defined in @/lib/types/dashboard.ts and @/lib/insights/types.ts
// to avoid "use server" export restrictions. Re-imported here for use in functions.

import type {
  DateRangeParam,
  TrendInterval,
  RevenueTrendPoint,
  RevenueTrendBySourcePoint,
  RevenueTrendData,
  RevenueBySourceItem,
  TopCustomer,
  CustomerDetail,
} from "@/lib/types/dashboard";

// ─── Helpers ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDateFilter(query: any, dateColumn: string, dateRange?: DateRangeParam) {
  if (!dateRange) return query;
  if (dateRange.from) {
    query = query.gte(dateColumn, dateRange.from);
  }
  if (dateRange.to) {
    query = query.lte(dateColumn, dateRange.to);
  }
  return query;
}

// ─── Auth helper ───────────────────────────────────────────

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

// ─── New: Shared internal resolve + compute ────────────────

async function _resolveAndCompute(profileParam?: string | null): Promise<{
  customers: ComputedCustomer[];
  config: ResolvedConfig;
  insightResults: InsightResult[];
}> {
  const config = await resolveConfig(profileParam);
  const customers = await computeAllCustomerMetrics(config);
  const insightResults = INSIGHT_CARDS.map((card) =>
    card.compute(customers, config)
  );
  return { customers, config, insightResults };
}

// ─── New: getComputedCustomersForTable ─────────────────────

export async function getComputedCustomersForTable(
  profileParam?: string | null
): Promise<{ customers: ComputedCustomer[]; config: ResolvedConfig }> {
  await requireAuth();
  const { customers, config } = await _resolveAndCompute(profileParam);
  return { customers, config };
}

// ─── New: getInsightCardResults ────────────────────────────

export async function getInsightCardResults(
  profileParam?: string | null
): Promise<{ config: ResolvedConfig; insightResults: InsightResult[] }> {
  await requireAuth();
  const { config, insightResults } = await _resolveAndCompute(profileParam);
  return { config, insightResults };
}

// ─── getRevenueTrend (unchanged) ──────────────────────────

/** Pick the best grouping interval based on how many days the range spans */
function chooseInterval(spanDays: number): TrendInterval {
  if (spanDays <= 42) return "day";
  if (spanDays <= 365) return "week";
  return "month";
}

/** Format a Date to a bucket key for the chosen interval */
function toBucketKey(d: Date, interval: TrendInterval): string {
  if (interval === "day") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (interval === "week") {
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    return `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/** Generate all bucket keys between from and to for the chosen interval */
function generateBuckets(from: Date, to: Date, interval: TrendInterval): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const cursor = new Date(from);

  if (interval === "day") {
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    while (cursor <= end) {
      const key = toBucketKey(cursor, interval);
      if (!seen.has(key)) { keys.push(key); seen.add(key); }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (interval === "week") {
    const day = cursor.getDay();
    cursor.setDate(cursor.getDate() - ((day + 6) % 7));
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= to) {
      const key = toBucketKey(cursor, interval);
      if (!seen.has(key)) { keys.push(key); seen.add(key); }
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= to) {
      const key = toBucketKey(cursor, interval);
      if (!seen.has(key)) { keys.push(key); seen.add(key); }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return keys;
}

export async function getRevenueTrend(
  dateRange?: DateRangeParam
): Promise<RevenueTrendData> {
  await requireAuth();
  const admin = createAdminClient();

  let query = admin
    .from("payments")
    .select("amount, payment_date, source")
    .eq("org_id", DEFAULT_ORG_ID)
    .in("status", ["succeeded", "approved"])
    .order("payment_date", { ascending: true });

  query = applyDateFilter(query, "payment_date", dateRange);
  const { data: payments } = await query;

  const SOURCES = ["stripe", "pos", "wetravel", "calendly", "passline", "manual"] as const;
  const emptySource = (): Omit<RevenueTrendBySourcePoint, "label"> => ({
    stripe: 0, pos: 0, wetravel: 0, calendly: 0, passline: 0, manual: 0,
  });

  const now = new Date();
  let from: Date;
  let to: Date;

  if (dateRange?.from) {
    from = new Date(dateRange.from);
    to = dateRange.to ? new Date(dateRange.to) : now;
  } else {
    from = new Date(now);
    from.setMonth(from.getMonth() - 11);
    from.setDate(1);
    to = now;
  }

  const spanDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  const interval = chooseInterval(spanDays);

  const bucketKeys = generateBuckets(from, to, interval);
  const totalMap = new Map<string, { revenue: number; purchases: number }>();
  const sourceMap = new Map<string, Omit<RevenueTrendBySourcePoint, "label">>();

  for (const key of bucketKeys) {
    totalMap.set(key, { revenue: 0, purchases: 0 });
    sourceMap.set(key, emptySource());
  }

  for (const p of payments ?? []) {
    const d = new Date(p.payment_date);
    const key = toBucketKey(d, interval);
    const amount = Number(p.amount) || 0;
    const source = (p.source || "manual").toLowerCase() as typeof SOURCES[number];

    const existing = totalMap.get(key) ?? { revenue: 0, purchases: 0 };
    existing.revenue += amount;
    existing.purchases += 1;
    totalMap.set(key, existing);

    const sourceEntry = sourceMap.get(key) ?? emptySource();
    if (SOURCES.includes(source)) {
      sourceEntry[source] += amount;
    } else {
      sourceEntry.manual += amount;
    }
    sourceMap.set(key, sourceEntry);
  }

  const total: RevenueTrendPoint[] = bucketKeys.map((key) => {
    const d = totalMap.get(key)!;
    return { label: key, revenue: Math.round(d.revenue * 100) / 100, purchases: d.purchases };
  });

  const bySource: RevenueTrendBySourcePoint[] = bucketKeys.map((key) => {
    const d = sourceMap.get(key)!;
    return {
      label: key,
      stripe: Math.round(d.stripe * 100) / 100,
      pos: Math.round(d.pos * 100) / 100,
      wetravel: Math.round(d.wetravel * 100) / 100,
      calendly: Math.round(d.calendly * 100) / 100,
      passline: Math.round(d.passline * 100) / 100,
      manual: Math.round(d.manual * 100) / 100,
    };
  });

  return { total, bySource, interval };
}

// ─── getRevenueBySource (unchanged) ───────────────────────

export async function getRevenueBySource(dateRange?: DateRangeParam): Promise<RevenueBySourceItem[]> {
  await requireAuth();
  const admin = createAdminClient();

  let query = admin.from("payments").select("source, amount").eq("org_id", DEFAULT_ORG_ID).in("status", ["succeeded", "approved"]);
  query = applyDateFilter(query, "payment_date", dateRange);
  const { data: payments } = await query;

  const sourceMap = new Map<string, number>();
  let grandTotal = 0;
  for (const p of payments ?? []) {
    const source = p.source || "manual";
    const amount = Number(p.amount) || 0;
    sourceMap.set(source, (sourceMap.get(source) ?? 0) + amount);
    grandTotal += amount;
  }

  return Array.from(sourceMap.entries())
    .map(([source, revenue]) => ({
      source,
      revenue: Math.round(revenue * 100) / 100,
      percentage: grandTotal > 0 ? Math.round((revenue / grandTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ─── getTopCustomers (unchanged) ──────────────────────────

export async function getTopCustomers(dateRange?: DateRangeParam, limit: number = 5): Promise<TopCustomer[]> {
  await requireAuth();
  const admin = createAdminClient();

  let paymentsQuery = admin.from("payments").select("customer_id, amount").eq("org_id", DEFAULT_ORG_ID).in("status", ["succeeded", "approved"]);
  paymentsQuery = applyDateFilter(paymentsQuery, "payment_date", dateRange);

  const [paymentsRes, customersRes, sourcesRes] = await Promise.all([
    paymentsQuery,
    admin.from("customers").select("id, full_name, email").eq("org_id", DEFAULT_ORG_ID),
    admin.from("customer_sources").select("customer_id, source"),
  ]);

  const payments = paymentsRes.data ?? [];
  const customers = customersRes.data ?? [];
  const sources = sourcesRes.data ?? [];

  const revenueMap = new Map<string, number>();
  for (const p of payments) {
    if (!p.customer_id) continue;
    revenueMap.set(p.customer_id, (revenueMap.get(p.customer_id) ?? 0) + (Number(p.amount) || 0));
  }

  const sourceMap = new Map<string, Set<string>>();
  for (const s of sources) {
    if (!s.customer_id) continue;
    const set = sourceMap.get(s.customer_id) ?? new Set();
    set.add(s.source);
    sourceMap.set(s.customer_id, set);
  }

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const sorted = Array.from(revenueMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);

  return sorted.map(([id, revenue]) => {
    const c = customerMap.get(id);
    return {
      id,
      full_name: c?.full_name ?? null,
      email: c?.email ?? null,
      totalRevenue: Math.round(revenue * 100) / 100,
      sources: Array.from(sourceMap.get(id) ?? []),
    };
  });
}

// ─── searchCustomers (unchanged) ──────────────────────────

export async function searchCustomers(
  query: string
): Promise<{ id: string; full_name: string | null; email: string | null; phone: string | null }[]> {
  await requireAuth();
  const admin = createAdminClient();
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q}%`;

  const { data } = await admin
    .from("customers")
    .select("id, full_name, email, phone")
    .eq("org_id", DEFAULT_ORG_ID)
    .or(`full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
    .limit(10);

  return data ?? [];
}

// ─── getCustomerDetail (updated: org_id guards on all queries) ─

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  await requireAuth();
  const admin = createAdminClient();
  const now = new Date();

  const config = await resolveConfig();

  const [customerRes, paymentsRes, bookingsRes, attendanceRes, sourcesRes] = await Promise.all([
    admin.from("customers").select("id, full_name, email, phone, country").eq("id", customerId).eq("org_id", DEFAULT_ORG_ID).single(),
    admin.from("payments").select("id, source, amount, payment_date, payment_type, status, external_payment_id, currency, raw_data").eq("customer_id", customerId).eq("org_id", DEFAULT_ORG_ID).order("payment_date", { ascending: false }),
    admin.from("bookings").select("id, source, event_type, start_time, end_time, start_date, end_date, status, external_booking_id, utm_source, utm_medium, utm_campaign, utm_content, referrer, referral_partner, lead_source_channel, lead_capture_method, raw_data").eq("customer_id", customerId).eq("org_id", DEFAULT_ORG_ID).order("start_time", { ascending: false }),
    admin.from("attendance").select("id, source, event_name, check_in_time, ticket_type, external_attendance_id, raw_data").eq("customer_id", customerId).eq("org_id", DEFAULT_ORG_ID).order("check_in_time", { ascending: false }),
    admin.from("customer_sources").select("source").eq("customer_id", customerId).eq("org_id", DEFAULT_ORG_ID),
  ]);

  if (!customerRes.data) return null;

  const c = customerRes.data;
  const payments = paymentsRes.data ?? [];
  const bookings = bookingsRes.data ?? [];
  const attendanceList = attendanceRes.data ?? [];
  const sources = (sourcesRes.data ?? []).map((s: { source: string }) => s.source);

  const validPayments = payments.filter((p: { status: string }) => p.status === "succeeded" || p.status === "approved");
  const totalRevenue = validPayments.reduce((sum: number, p: { amount: number }) => sum + (Number(p.amount) || 0), 0);
  const purchaseCount = validPayments.length;

  const lastPaymentDate = payments.length > 0 ? payments[0].payment_date : null;
  const lastBookingDate = bookings.length > 0 ? bookings[0].start_time : null;
  const lastAttendanceDate = attendanceList.length > 0 ? attendanceList[0].check_in_time : null;
  const lastActivity = maxDate(lastPaymentDate, lastBookingDate, lastAttendanceDate);
  const daysSince = lastActivity
    ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const customer = {
    id: c.id,
    full_name: c.full_name,
    email: c.email,
    phone: c.phone,
    country: c.country,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    purchaseCount,
    lastActivityDate: lastActivity,
    revenue_tier: computeRevenueTier(Math.round(totalRevenue * 100) / 100, config),
    risk_status: computeRiskStatus(daysSince, config),
    sources,
  };

  const transactions: CustomerDetail["transactions"] = [];
  for (const p of payments) {
    transactions.push({
      id: p.id, type: "payment", source: p.source || "unknown",
      description: [p.payment_type, p.status].filter(Boolean).join(" - ") || "Payment",
      amount: Number(p.amount) || 0, date: p.payment_date, status: p.status ?? undefined,
      external_payment_id: p.external_payment_id ?? undefined,
      payment_type: p.payment_type ?? undefined,
      currency: p.currency ?? undefined,
      raw_data: p.raw_data ?? undefined,
    });
  }
  for (const b of bookings) {
    transactions.push({
      id: b.id, type: "booking", source: b.source || "unknown",
      description: b.event_type || "Booking", amount: null, date: b.start_time,
      status: b.status ?? undefined,
      external_booking_id: b.external_booking_id ?? undefined,
      event_type: b.event_type ?? undefined,
      start_time: b.start_time ?? undefined,
      end_time: b.end_time ?? undefined,
      start_date: b.start_date ?? undefined,
      end_date: b.end_date ?? undefined,
      utm_source: b.utm_source ?? undefined,
      utm_medium: b.utm_medium ?? undefined,
      utm_campaign: b.utm_campaign ?? undefined,
      utm_content: b.utm_content ?? undefined,
      referrer: b.referrer ?? undefined,
      referral_partner: b.referral_partner ?? undefined,
      lead_source_channel: b.lead_source_channel ?? undefined,
      lead_capture_method: b.lead_capture_method ?? undefined,
      raw_data: b.raw_data ?? undefined,
    });
  }
  for (const a of attendanceList) {
    transactions.push({
      id: a.id, type: "attendance", source: a.source || "unknown",
      description: a.event_name || a.ticket_type || "Attendance", amount: null, date: a.check_in_time,
      external_attendance_id: a.external_attendance_id ?? undefined,
      event_name: a.event_name ?? undefined,
      ticket_type: a.ticket_type ?? undefined,
      raw_data: a.raw_data ?? undefined,
    });
  }
  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { customer, transactions };
}
