"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// ─── Types ─────────────────────────────────────────────────

export interface DateRangeParam {
  from: string | null;
  to: string | null;
}

export interface DashboardMetrics {
  totalRevenue: number;
  revenueChange: number;
  activeCustomers: number;
  atRiskCustomers: number;
  highValueCustomers: number;
  purchaseFrequency: number;
}

export type TrendInterval = "day" | "week" | "month";

export interface RevenueTrendPoint {
  label: string;
  revenue: number;
  purchases: number;
}

export interface RevenueTrendBySourcePoint {
  label: string;
  stripe: number;
  pos: number;
  wetravel: number;
  calendly: number;
  passline: number;
  manual: number;
}

export interface RevenueTrendData {
  total: RevenueTrendPoint[];
  bySource: RevenueTrendBySourcePoint[];
  interval: TrendInterval;
}

export interface RevenueBySourceItem {
  source: string;
  revenue: number;
  percentage: number;
}

export interface TopCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  totalRevenue: number;
  sources: string[];
}

export interface CustomerRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  totalRevenue: number;
  purchaseCount: number;
  lastActivityDate: string | null;
  status: "Active" | "At Risk" | "Churned";
  segment: "High Value" | "Regular" | "Low Value";
  sources: string[];
}

export interface CustomerDetail {
  customer: CustomerRow;
  transactions: {
    id: string;
    type: "payment" | "booking" | "attendance";
    source: string;
    description: string;
    amount: number | null;
    date: string;
    status?: string;
    // Payment extras
    external_payment_id?: string;
    payment_type?: string;
    currency?: string;
    // Booking extras
    external_booking_id?: string;
    event_type?: string;
    start_time?: string;
    end_time?: string;
    start_date?: string;
    end_date?: string;
    // Attendance extras
    external_attendance_id?: string;
    event_name?: string;
    ticket_type?: string;
    // Attribution
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    referrer?: string;
    referral_partner?: string;
    lead_source_channel?: string;
    lead_capture_method?: string;
    // Raw data
    raw_data?: Record<string, unknown>;
  }[];
}

export interface InsightConfigData {
  churn_days: number;
  high_value_threshold: number;
}

// ─── Helpers ───────────────────────────────────────────────

function computeStatus(
  daysSinceLastActivity: number | null,
  churnDays: number
): "Active" | "At Risk" | "Churned" {
  if (daysSinceLastActivity === null) return "Churned";
  if (daysSinceLastActivity > churnDays * 1.5) return "Churned";
  if (daysSinceLastActivity > churnDays) return "At Risk";
  return "Active";
}

function computeSegment(
  totalRevenue: number,
  highValueThreshold: number
): "High Value" | "Regular" | "Low Value" {
  if (totalRevenue >= highValueThreshold) return "High Value";
  if (totalRevenue >= highValueThreshold * 0.3) return "Regular";
  return "Low Value";
}

function daysBetween(dateStr: string, now: Date): number {
  return Math.floor(
    (now.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function maxDate(...dates: (string | null | undefined)[]): string | null {
  let max: string | null = null;
  for (const d of dates) {
    if (d && (!max || d > max)) max = d;
  }
  return max;
}

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

// ─── 1. getInsightConfig ──────────────────────────────────

export async function getInsightConfig(): Promise<InsightConfigData> {
  await requireAuth();
  const admin = createAdminClient();

  const { data } = await admin
    .from("insight_config")
    .select("churn_days, high_value_threshold")
    .eq("org_id", DEFAULT_ORG_ID)
    .single();

  return {
    churn_days: data?.churn_days ?? 90,
    high_value_threshold: data?.high_value_threshold ?? 500,
  };
}

// ─── 2. updateInsightConfig ───────────────────────────────

export async function updateInsightConfig(
  churnDays: number,
  highValueThreshold: number
): Promise<InsightConfigData> {
  await requireAuth();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("insight_config")
    .upsert(
      {
        org_id: DEFAULT_ORG_ID,
        churn_days: churnDays,
        high_value_threshold: highValueThreshold,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" }
    )
    .select("churn_days, high_value_threshold")
    .single();

  if (error) throw new Error(`Failed to update insight config: ${error.message}`);

  return {
    churn_days: data?.churn_days ?? churnDays,
    high_value_threshold: data?.high_value_threshold ?? highValueThreshold,
  };
}

// ─── 3. getDashboardMetrics ───────────────────────────────

export async function getDashboardMetrics(
  churnDays: number,
  highValueThreshold: number,
  dateRange?: DateRangeParam
): Promise<DashboardMetrics> {
  await requireAuth();
  const admin = createAdminClient();
  const now = new Date();

  let paymentsQuery = admin
    .from("payments")
    .select("customer_id, amount, payment_date")
    .eq("org_id", DEFAULT_ORG_ID)
    .in("status", ["succeeded", "approved"]);
  paymentsQuery = applyDateFilter(paymentsQuery, "payment_date", dateRange);

  let bookingsQuery = admin
    .from("bookings")
    .select("customer_id, start_time")
    .eq("org_id", DEFAULT_ORG_ID);
  bookingsQuery = applyDateFilter(bookingsQuery, "start_time", dateRange);

  let attendanceQuery = admin
    .from("attendance")
    .select("customer_id, check_in_time")
    .eq("org_id", DEFAULT_ORG_ID);
  attendanceQuery = applyDateFilter(attendanceQuery, "check_in_time", dateRange);

  const [customersRes, paymentsRes, bookingsRes, attendanceRes] =
    await Promise.all([
      admin.from("customers").select("id").eq("org_id", DEFAULT_ORG_ID),
      paymentsQuery,
      bookingsQuery,
      attendanceQuery,
    ]);

  const customers = customersRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const bookings = bookingsRes.data ?? [];
  const attendance = attendanceRes.data ?? [];

  const customerPayments = new Map<string, { total: number; count: number; lastDate: string | null }>();
  for (const p of payments) {
    if (!p.customer_id) continue;
    const existing = customerPayments.get(p.customer_id) ?? { total: 0, count: 0, lastDate: null };
    existing.total += Number(p.amount) || 0;
    existing.count += 1;
    existing.lastDate = maxDate(existing.lastDate, p.payment_date);
    customerPayments.set(p.customer_id, existing);
  }

  const customerLastBooking = new Map<string, string>();
  for (const b of bookings) {
    if (!b.customer_id) continue;
    const existing = customerLastBooking.get(b.customer_id);
    if (!existing || b.start_time > existing) customerLastBooking.set(b.customer_id, b.start_time);
  }

  const customerLastAttendance = new Map<string, string>();
  for (const a of attendance) {
    if (!a.customer_id) continue;
    const existing = customerLastAttendance.get(a.customer_id);
    if (!existing || a.check_in_time > existing) customerLastAttendance.set(a.customer_id, a.check_in_time);
  }

  let totalRevenue = 0;
  let activeCount = 0;
  let atRiskCount = 0;
  let highValueCount = 0;
  let totalPaymentCount = 0;

  for (const c of customers) {
    const payInfo = customerPayments.get(c.id);
    const revenue = payInfo?.total ?? 0;
    totalRevenue += revenue;
    totalPaymentCount += payInfo?.count ?? 0;

    const lastActivity = maxDate(payInfo?.lastDate, customerLastBooking.get(c.id), customerLastAttendance.get(c.id));
    const daysSince = lastActivity ? daysBetween(lastActivity, now) : null;
    const status = computeStatus(daysSince, churnDays);
    const segment = computeSegment(revenue, highValueThreshold);

    if (status === "Active") activeCount++;
    if (status === "At Risk") atRiskCount++;
    if (segment === "High Value") highValueCount++;
  }

  let revenueChange = 0;
  if (dateRange?.from) {
    const rangeFrom = new Date(dateRange.from);
    const rangeTo = dateRange.to ? new Date(dateRange.to) : now;
    const rangeDuration = rangeTo.getTime() - rangeFrom.getTime();
    const priorFrom = new Date(rangeFrom.getTime() - rangeDuration);
    const priorTo = new Date(rangeFrom.getTime());

    const { data: priorPayments } = await admin
      .from("payments")
      .select("amount")
      .eq("org_id", DEFAULT_ORG_ID)
      .in("status", ["succeeded", "approved"])
      .gte("payment_date", priorFrom.toISOString())
      .lt("payment_date", priorTo.toISOString());

    const priorRevenue = (priorPayments ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    revenueChange = priorRevenue > 0 ? ((totalRevenue - priorRevenue) / priorRevenue) * 100 : totalRevenue > 0 ? 100 : 0;
  } else {
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    let recentRevenue = 0;
    let priorRevenue = 0;
    for (const p of payments) {
      const d = new Date(p.payment_date);
      const amount = Number(p.amount) || 0;
      if (d >= sixMonthsAgo) recentRevenue += amount;
      else if (d >= twelveMonthsAgo) priorRevenue += amount;
    }
    revenueChange = priorRevenue > 0 ? ((recentRevenue - priorRevenue) / priorRevenue) * 100 : recentRevenue > 0 ? 100 : 0;
  }

  const customersWithPayments = customerPayments.size;
  const purchaseFrequency = customersWithPayments > 0 ? Math.round((totalPaymentCount / customersWithPayments) * 10) / 10 : 0;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    revenueChange: Math.round(revenueChange * 10) / 10,
    activeCustomers: activeCount,
    atRiskCustomers: atRiskCount,
    highValueCustomers: highValueCount,
    purchaseFrequency,
  };
}

// ─── 4. getRevenueTrend ───────────────────────────────────

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
    // Week of — use Monday of the week
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
    // Start from Monday of the first week
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

  // Determine date range and interval
  const now = new Date();
  let from: Date;
  let to: Date;

  if (dateRange?.from) {
    from = new Date(dateRange.from);
    to = dateRange.to ? new Date(dateRange.to) : now;
  } else {
    // Default: last 12 months
    from = new Date(now);
    from.setMonth(from.getMonth() - 11);
    from.setDate(1);
    to = now;
  }

  const spanDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  const interval = chooseInterval(spanDays);

  // Pre-fill buckets
  const bucketKeys = generateBuckets(from, to, interval);
  const totalMap = new Map<string, { revenue: number; purchases: number }>();
  const sourceMap = new Map<string, Omit<RevenueTrendBySourcePoint, "label">>();

  for (const key of bucketKeys) {
    totalMap.set(key, { revenue: 0, purchases: 0 });
    sourceMap.set(key, emptySource());
  }

  // Aggregate payments into buckets
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

  // Build ordered arrays using the pre-filled bucket order
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

// ─── 5. getRevenueBySource ────────────────────────────────

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

// ─── 6. getTopCustomers ───────────────────────────────────

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

// ─── 7. getCustomersWithMetrics ───────────────────────────

export async function getCustomersWithMetrics(churnDays: number, highValueThreshold: number): Promise<CustomerRow[]> {
  await requireAuth();
  const admin = createAdminClient();
  const now = new Date();

  const [customersRes, paymentsRes, bookingsRes, attendanceRes, sourcesRes] = await Promise.all([
    admin.from("customers").select("id, full_name, email, phone, country").eq("org_id", DEFAULT_ORG_ID),
    admin.from("payments").select("customer_id, amount, payment_date").eq("org_id", DEFAULT_ORG_ID).in("status", ["succeeded", "approved"]),
    admin.from("bookings").select("customer_id, start_time").eq("org_id", DEFAULT_ORG_ID),
    admin.from("attendance").select("customer_id, check_in_time").eq("org_id", DEFAULT_ORG_ID),
    admin.from("customer_sources").select("customer_id, source"),
  ]);

  const customers = customersRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const bookings = bookingsRes.data ?? [];
  const attendance = attendanceRes.data ?? [];
  const sources = sourcesRes.data ?? [];

  const paymentAgg = new Map<string, { total: number; count: number; lastDate: string | null }>();
  for (const p of payments) {
    if (!p.customer_id) continue;
    const agg = paymentAgg.get(p.customer_id) ?? { total: 0, count: 0, lastDate: null };
    agg.total += Number(p.amount) || 0;
    agg.count += 1;
    agg.lastDate = maxDate(agg.lastDate, p.payment_date);
    paymentAgg.set(p.customer_id, agg);
  }

  const lastBooking = new Map<string, string>();
  for (const b of bookings) {
    if (!b.customer_id) continue;
    const existing = lastBooking.get(b.customer_id);
    if (!existing || b.start_time > existing) lastBooking.set(b.customer_id, b.start_time);
  }

  const lastAttendance = new Map<string, string>();
  for (const a of attendance) {
    if (!a.customer_id) continue;
    const existing = lastAttendance.get(a.customer_id);
    if (!existing || a.check_in_time > existing) lastAttendance.set(a.customer_id, a.check_in_time);
  }

  const sourceMap = new Map<string, Set<string>>();
  for (const s of sources) {
    if (!s.customer_id) continue;
    const set = sourceMap.get(s.customer_id) ?? new Set();
    set.add(s.source);
    sourceMap.set(s.customer_id, set);
  }

  return customers.map((c) => {
    const payInfo = paymentAgg.get(c.id);
    const revenue = payInfo?.total ?? 0;
    const purchaseCount = payInfo?.count ?? 0;
    const lastActivity = maxDate(payInfo?.lastDate, lastBooking.get(c.id), lastAttendance.get(c.id));
    const daysSince = lastActivity ? daysBetween(lastActivity, now) : null;

    return {
      id: c.id,
      full_name: c.full_name,
      email: c.email,
      phone: c.phone,
      country: c.country,
      totalRevenue: Math.round(revenue * 100) / 100,
      purchaseCount,
      lastActivityDate: lastActivity,
      status: computeStatus(daysSince, churnDays),
      segment: computeSegment(revenue, highValueThreshold),
      sources: Array.from(sourceMap.get(c.id) ?? []),
    };
  });
}

// ─── 8. searchCustomers ───────────────────────────────────

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

// ─── 9. getCustomerDetail ─────────────────────────────────

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  await requireAuth();
  const admin = createAdminClient();
  const now = new Date();

  const configRes = await admin.from("insight_config").select("churn_days, high_value_threshold").eq("org_id", DEFAULT_ORG_ID).single();
  const churnDays = configRes.data?.churn_days ?? 90;
  const highValueThreshold = configRes.data?.high_value_threshold ?? 500;

  const [customerRes, paymentsRes, bookingsRes, attendanceRes, sourcesRes] = await Promise.all([
    admin.from("customers").select("id, full_name, email, phone, country").eq("id", customerId).single(),
    admin.from("payments").select("id, source, amount, payment_date, payment_type, status, external_payment_id, currency, raw_data").eq("customer_id", customerId).order("payment_date", { ascending: false }),
    admin.from("bookings").select("id, source, event_type, start_time, end_time, start_date, end_date, status, external_booking_id, utm_source, utm_medium, utm_campaign, utm_content, referrer, referral_partner, lead_source_channel, lead_capture_method, raw_data").eq("customer_id", customerId).order("start_time", { ascending: false }),
    admin.from("attendance").select("id, source, event_name, check_in_time, ticket_type, external_attendance_id, raw_data").eq("customer_id", customerId).order("check_in_time", { ascending: false }),
    admin.from("customer_sources").select("source").eq("customer_id", customerId),
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
  const daysSince = lastActivity ? daysBetween(lastActivity, now) : null;

  const customerRow: CustomerRow = {
    id: c.id, full_name: c.full_name, email: c.email, phone: c.phone, country: c.country,
    totalRevenue: Math.round(totalRevenue * 100) / 100, purchaseCount, lastActivityDate: lastActivity,
    status: computeStatus(daysSince, churnDays), segment: computeSegment(totalRevenue, highValueThreshold), sources,
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

  return { customer: customerRow, transactions };
}
