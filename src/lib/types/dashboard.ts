// Dashboard-specific types (extracted from server actions for client import compatibility)

export interface DateRangeParam {
  from: string | null;
  to: string | null;
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

export interface CustomerDetail {
  customer: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
    totalRevenue: number;
    purchaseCount: number;
    lastActivityDate: string | null;
    revenue_tier: "Tier A" | "Tier B" | "Tier C";
    risk_status: "Healthy" | "At Risk" | "Dormant" | "Lost";
    sources: string[];
    sourceLinks: {
      source: string;
      external_id: string;
      external_email: string | null;
      external_name: string | null;
    }[];
    revenueBySource: Record<string, number>;
  };
  transactions: {
    id: string;
    type: "payment" | "booking" | "attendance";
    source: string;
    description: string;
    amount: number | null;
    date: string;
    status?: string;
    external_payment_id?: string;
    payment_type?: string;
    currency?: string;
    external_booking_id?: string;
    event_type?: string;
    start_time?: string;
    end_time?: string;
    start_date?: string;
    end_date?: string;
    external_attendance_id?: string;
    event_name?: string;
    ticket_type?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    referrer?: string;
    referral_partner?: string;
    lead_source_channel?: string;
    lead_capture_method?: string;
    raw_data?: Record<string, unknown>;
  }[];
}
