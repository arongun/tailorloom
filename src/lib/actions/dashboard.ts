"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// ─── Types ─────────────────────────────────────────────────

export interface DashboardMetrics {
  totalRevenue: number;
  revenueChange: number;
  activeCustomers: number;
  atRiskCustomers: number;
  highValueCustomers: number;
  purchaseFrequency: number;
}

export interface RevenueTrendPoint {
  month: string;
  revenue: number;
  purchases: number;
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
  highValueThreshold: number
): Promise<DashboardMetrics> {
  await requireAuth();
  const admin = createAdminClient();
  const now = new Date();

  // Fetch all data in parallel
  const [customersRes, paymentsRes, bookingsRes, attendanceRes] =
    await Promise.all([
      admin
        .from("customers")
        .select("id")
        .eq("org_id", DEFAULT_ORG_ID),
      admin
        .from("payments")
        .select("customer_id, amount, payment_date")
        .eq("org_id", DEFAULT_ORG_ID),
      admin
        .from("bookings")
        .select("customer_id, start_time")
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

  // Build per-customer aggregates
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
    if (!existing || b.start_time > existing) {
      customerLastBooking.set(b.customer_id, b.start_time);
    }
  }

  const customerLastAttendance = new Map<string, string>();
  for (const a of attendance) {
    if (!a.customer_id) continue;
    const existing = customerLastAttendance.get(a.customer_id);
    if (!existing || a.check_in_time > existing) {
      customerLastAttendance.set(a.customer_id, a.check_in_time);
    }
  }

  // Compute metrics
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

    const lastActivity = maxDate(
      payInfo?.lastDate,
      customerLastBooking.get(c.id),
      customerLastAttendance.get(c.id)
    );

    const daysSince = lastActivity ? daysBetween(lastActivity, now) : null;
    const status = computeStatus(daysSince, churnDays);
    const segment = computeSegment(revenue, highValueThreshold);

    if (status === "Active") activeCount++;
    if (status === "At Risk") atRiskCount++;
    if (segment === "High Value") highValueCount++;
  }

  // Revenue change: last 6mo vs prior 6mo
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  let recentRevenue = 0;
  let priorRevenue = 0;
  for (const p of payments) {
    const d = new Date(p.payment_date);
    const amount = Number(p.amount) || 0;
    if (d >= sixMonthsAgo) {
      recentRevenue += amount;
    } else if (d >= twelveMonthsAgo) {
      priorRevenue += amount;
    }
  }

  const revenueChange =
    priorRevenue > 0
      ? ((recentRevenue - priorRevenue) / priorRevenue) * 100
      : recentRevenue > 0
        ? 100
        : 0;

  // Purchase frequency = avg payments per customer (only customers with at least 1 payment)
  const customersWithPayments = customerPayments.size;
  const purchaseFrequency =
    customersWithPayments > 0
      ? Math.round((totalPaymentCount / customersWithPayments) * 10) / 10
      : 0;

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

export async function getRevenueTrend(
  range: "3mo" | "6mo" | "12mo" | "all"
): Promise<RevenueTrendPoint[]> {
  await requireAuth();
  const admin = createAdminClient();

  let query = admin
    .from("payments")
    .select("amount, payment_date")
    .eq("org_id", DEFAULT_ORG_ID)
    .order("payment_date", { ascending: true });

  const now = new Date();
  if (range !== "all") {
    const months = range === "3mo" ? 3 : range === "6mo" ? 6 : 12;
    const start = new Date(now.getFullYear(), now.getMonth() - months, 1);
    query = query.gte("payment_date", start.toISOString());
  }

  const { data: payments } = await query;

  // Group by month
  const monthMap = new Map<string, { revenue: number; purchases: number }>();

  // Pre-fill months so we get zero-value entries
  const monthCount = range === "3mo" ? 3 : range === "6mo" ? 6 : range === "12mo" ? 12 : 0;

  if (monthCount > 0) {
    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
      monthMap.set(key, { revenue: 0, purchases: 0 });
    }
  }

  for (const p of payments ?? []) {
    const d = new Date(p.payment_date);
    const key = d.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
    const existing = monthMap.get(key) ?? { revenue: 0, purchases: 0 };
    existing.revenue += Number(p.amount) || 0;
    existing.purchases += 1;
    monthMap.set(key, existing);
  }

  // For "all" range, sort by actual date
  if (range === "all" && payments && payments.length > 0) {
    // Build sorted entries from the map
    const entries = Array.from(monthMap.entries());
    // Parse month keys back to dates for sorting
    entries.sort((a, b) => {
      const parseKey = (k: string) => {
        const [mon, yr] = k.split(" ");
        return new Date(`${mon} 1, 20${yr}`);
      };
      return parseKey(a[0]).getTime() - parseKey(b[0]).getTime();
    });
    return entries.map(([month, data]) => ({
      month,
      revenue: Math.round(data.revenue * 100) / 100,
      purchases: data.purchases,
    }));
  }

  return Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    revenue: Math.round(data.revenue * 100) / 100,
    purchases: data.purchases,
  }));
}

// ─── 5. getCustomersWithMetrics ───────────────────────────

export async function getCustomersWithMetrics(
  churnDays: number,
  highValueThreshold: number
): Promise<CustomerRow[]> {
  await requireAuth();
  const admin = createAdminClient();
  const now = new Date();

  const [customersRes, paymentsRes, bookingsRes, attendanceRes, sourcesRes] =
    await Promise.all([
      admin
        .from("customers")
        .select("id, full_name, email, phone, country")
        .eq("org_id", DEFAULT_ORG_ID),
      admin
        .from("payments")
        .select("customer_id, amount, payment_date")
        .eq("org_id", DEFAULT_ORG_ID),
      admin
        .from("bookings")
        .select("customer_id, start_time")
        .eq("org_id", DEFAULT_ORG_ID),
      admin
        .from("attendance")
        .select("customer_id, check_in_time")
        .eq("org_id", DEFAULT_ORG_ID),
      admin
        .from("customer_sources")
        .select("customer_id, source"),
    ]);

  const customers = customersRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const bookings = bookingsRes.data ?? [];
  const attendance = attendanceRes.data ?? [];
  const sources = sourcesRes.data ?? [];

  // Build aggregates
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
    if (!existing || b.start_time > existing) {
      lastBooking.set(b.customer_id, b.start_time);
    }
  }

  const lastAttendance = new Map<string, string>();
  for (const a of attendance) {
    if (!a.customer_id) continue;
    const existing = lastAttendance.get(a.customer_id);
    if (!existing || a.check_in_time > existing) {
      lastAttendance.set(a.customer_id, a.check_in_time);
    }
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

    const lastActivity = maxDate(
      payInfo?.lastDate,
      lastBooking.get(c.id),
      lastAttendance.get(c.id)
    );

    const daysSince = lastActivity ? daysBetween(lastActivity, now) : null;
    const status = computeStatus(daysSince, churnDays);
    const segment = computeSegment(revenue, highValueThreshold);

    return {
      id: c.id,
      full_name: c.full_name,
      email: c.email,
      phone: c.phone,
      country: c.country,
      totalRevenue: Math.round(revenue * 100) / 100,
      purchaseCount,
      lastActivityDate: lastActivity,
      status,
      segment,
      sources: Array.from(sourceMap.get(c.id) ?? []),
    };
  });
}

// ─── 6. searchCustomers ───────────────────────────────────

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

// ─── 7. getCustomerDetail ─────────────────────────────────

export async function getCustomerDetail(
  customerId: string
): Promise<CustomerDetail | null> {
  await requireAuth();
  const admin = createAdminClient();
  const now = new Date();

  // Fetch config for status/segment computation
  const configRes = await admin
    .from("insight_config")
    .select("churn_days, high_value_threshold")
    .eq("org_id", DEFAULT_ORG_ID)
    .single();

  const churnDays = configRes.data?.churn_days ?? 90;
  const highValueThreshold = configRes.data?.high_value_threshold ?? 500;

  // Fetch customer and all related data in parallel
  const [customerRes, paymentsRes, bookingsRes, attendanceRes, sourcesRes] =
    await Promise.all([
      admin
        .from("customers")
        .select("id, full_name, email, phone, country")
        .eq("id", customerId)
        .single(),
      admin
        .from("payments")
        .select("id, source, amount, payment_date, payment_type, status")
        .eq("customer_id", customerId)
        .order("payment_date", { ascending: false }),
      admin
        .from("bookings")
        .select("id, source, event_type, start_time, status")
        .eq("customer_id", customerId)
        .order("start_time", { ascending: false }),
      admin
        .from("attendance")
        .select("id, source, event_name, check_in_time, ticket_type")
        .eq("customer_id", customerId)
        .order("check_in_time", { ascending: false }),
      admin
        .from("customer_sources")
        .select("source")
        .eq("customer_id", customerId),
    ]);

  if (!customerRes.data) return null;

  const c = customerRes.data;
  const payments = paymentsRes.data ?? [];
  const bookings = bookingsRes.data ?? [];
  const attendanceList = attendanceRes.data ?? [];
  const sources = (sourcesRes.data ?? []).map(
    (s: { source: string }) => s.source
  );

  // Compute customer metrics
  const totalRevenue = payments.reduce(
    (sum: number, p: { amount: number }) => sum + (Number(p.amount) || 0),
    0
  );
  const purchaseCount = payments.length;

  const lastPaymentDate =
    payments.length > 0 ? payments[0].payment_date : null;
  const lastBookingDate =
    bookings.length > 0 ? bookings[0].start_time : null;
  const lastAttendanceDate =
    attendanceList.length > 0 ? attendanceList[0].check_in_time : null;

  const lastActivity = maxDate(
    lastPaymentDate,
    lastBookingDate,
    lastAttendanceDate
  );
  const daysSince = lastActivity ? daysBetween(lastActivity, now) : null;

  const customerRow: CustomerRow = {
    id: c.id,
    full_name: c.full_name,
    email: c.email,
    phone: c.phone,
    country: c.country,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    purchaseCount,
    lastActivityDate: lastActivity,
    status: computeStatus(daysSince, churnDays),
    segment: computeSegment(totalRevenue, highValueThreshold),
    sources,
  };

  // Build unified transaction timeline
  const transactions: CustomerDetail["transactions"] = [];

  for (const p of payments) {
    transactions.push({
      id: p.id,
      type: "payment",
      source: p.source || "unknown",
      description: [p.payment_type, p.status]
        .filter(Boolean)
        .join(" - ") || "Payment",
      amount: Number(p.amount) || 0,
      date: p.payment_date,
    });
  }

  for (const b of bookings) {
    transactions.push({
      id: b.id,
      type: "booking",
      source: b.source || "unknown",
      description: b.event_type || "Booking",
      amount: null,
      date: b.start_time,
    });
  }

  for (const a of attendanceList) {
    transactions.push({
      id: a.id,
      type: "attendance",
      source: a.source || "unknown",
      description: a.event_name || a.ticket_type || "Attendance",
      amount: null,
      date: a.check_in_time,
    });
  }

  // Sort by date descending
  transactions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return { customer: customerRow, transactions };
}
