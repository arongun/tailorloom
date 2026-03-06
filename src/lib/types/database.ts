// Database types matching the Supabase schema
// These will be replaced by auto-generated types from `supabase gen types` once the schema is live

export type SourceType = "stripe" | "calendly" | "passline" | "pos" | "wetravel" | "manual" | "crm" | "attribution";
export type ImportStatus = "pending" | "processing" | "completed" | "failed" | "skipped" | "reverted";
export type PaymentStatus = "succeeded" | "pending" | "failed" | "refunded" | "disputed" | "approved" | "void";
export type BookingStatus = "scheduled" | "completed" | "cancelled" | "no_show" | "confirmed" | "rescheduled";
export type ConflictStatus = "pending" | "merged" | "dismissed" | "split";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  org_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  notes: string | null;
  last_visit_date: string | null;
  classes_remaining: number | null;
  membership_status: string | null;
  referral_source: string | null;
  occupation: string | null;
  skill_level: string | null;
  member_type: string | null;
  join_date: string | null;
  preferred_currency: string | null;
  preferred_time_slot: string | null;
  name_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerSource {
  id: string;
  customer_id: string;
  source: SourceType;
  external_id: string;
  external_email: string | null;
  external_name: string | null;
  import_id: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface ImportHistory {
  id: string;
  org_id: string;
  source: SourceType;
  file_name: string;
  file_size_bytes: number | null;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_rows: number;
  status: ImportStatus;
  column_mapping: Record<string, string> | null;
  errors: ImportError[] | null;
  imported_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  severity?: "error" | "warning";
}

export interface Payment {
  id: string;
  org_id: string;
  customer_id: string;
  import_id: string | null;
  external_payment_id: string | null;
  source: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_date: string;
  payment_type: string | null;
  amount_usd: number | null;
  fx_rate: number | null;
  fx_rate_date: string | null;
  fx_source: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface Booking {
  id: string;
  org_id: string;
  customer_id: string;
  import_id: string | null;
  external_booking_id: string | null;
  source: string;
  event_type: string | null;
  start_time: string;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  status: BookingStatus;
  lead_source_channel: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  referrer: string | null;
  referral_partner: string | null;
  lead_capture_method: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  org_id: string;
  customer_id: string;
  import_id: string | null;
  external_attendance_id: string | null;
  source: string;
  event_name: string | null;
  check_in_time: string;
  ticket_type: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface InsightConfig {
  id: string;
  org_id: string;
  churn_days: number;
  high_value_threshold: number;
  at_risk_days: number | null;
  dormant_days: number | null;
  lost_days: number | null;
  repeat_purchase_min: number | null;
  active_profile: string | null;
  new_high_value_window_days: number | null;
  one_and_done_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface SavedMapping {
  id: string;
  org_id: string;
  source: SourceType;
  name: string;
  mapping: Record<string, string>;
  sample_headers: string[] | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface StitchingConflict {
  id: string;
  org_id: string;
  customer_a_id: string;
  customer_b_id: string;
  match_field: string;
  match_value: string | null;
  confidence: number | null;
  status: ConflictStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  import_id: string | null;
  created_at: string;
}

export interface CrmEnrichment {
  id: string;
  org_id: string;
  customer_id: string;
  import_id: string | null;
  enriched_fields: Record<string, unknown>;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface CustomerAttribution {
  id: string;
  org_id: string;
  customer_id: string;
  import_id: string | null;
  attribution_type: string | null;
  // Shared fields
  conversion_id: string | null;
  conversion_source: string | null;
  full_name: string | null;
  product: string | null;
  revenue_usd: number | null;
  conversion_date: string | null;
  first_touch_channel: string | null;
  referral_source: string | null;
  campaign: string | null;
  acquisition_date: string | null;
  // Summary-specific (first-touch)
  n_touchpoints: number | null;
  journey_span_days: number | null;
  first_touch_utm_source: string | null;
  first_touch_utm_medium: string | null;
  first_touch_campaign: string | null;
  first_touch_referrer: string | null;
  first_touch_date: string | null;
  last_touch_channel: string | null;
  last_touch_utm_source: string | null;
  last_touch_date: string | null;
  attributed_revenue_usd: number | null;
  // Touchpoint-specific (journeys)
  touch_id: string | null;
  touch_number: number | null;
  total_touches: number | null;
  touch_position: string | null;
  channel: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  touch_date: string | null;
  days_before_conversion: number | null;
  first_touch_credit: number | null;
  first_touch_revenue: number | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface FxRate {
  id: string;
  rate_date: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  source: string;
  fetched_at: string;
}
