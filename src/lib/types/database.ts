// Database types matching the Supabase schema
// These will be replaced by auto-generated types from `supabase gen types` once the schema is live

export type SourceType = "stripe" | "calendly" | "passline" | "manual";
export type ImportStatus = "pending" | "processing" | "completed" | "failed";
export type PaymentStatus = "succeeded" | "pending" | "failed" | "refunded";
export type BookingStatus = "scheduled" | "completed" | "cancelled" | "no_show";
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
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
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
}

export interface Payment {
  id: string;
  org_id: string;
  customer_id: string | null;
  import_id: string | null;
  stripe_payment_id: string | null;
  stripe_customer_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_date: string;
  description: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface Booking {
  id: string;
  org_id: string;
  customer_id: string | null;
  import_id: string | null;
  calendly_event_id: string | null;
  event_type: string | null;
  start_time: string;
  end_time: string | null;
  status: BookingStatus;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  org_id: string;
  customer_id: string | null;
  import_id: string | null;
  passline_id: string | null;
  event_name: string | null;
  check_in_time: string;
  raw_data: Record<string, unknown> | null;
  created_at: string;
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
