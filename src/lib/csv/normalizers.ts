/**
 * Status normalization maps for real-world export values
 * to our internal enum values.
 */

const PAYMENT_STATUS_MAP: Record<string, string> = {
  succeeded: "succeeded",
  paid: "succeeded",
  complete: "succeeded",
  pending: "pending",
  processing: "pending",
  failed: "failed",
  declined: "failed",
  refunded: "refunded",
  partially_refunded: "refunded",
};

const BOOKING_STATUS_MAP: Record<string, string> = {
  scheduled: "scheduled",
  active: "scheduled",
  confirmed: "scheduled",
  upcoming: "scheduled",
  completed: "completed",
  done: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  no_show: "no_show",
  "no show": "no_show",
  noshow: "no_show",
};

/**
 * Normalize a status value using the appropriate source map.
 * Returns the normalized value, or the original value if no mapping exists.
 */
export function normalizeStatus(
  value: string,
  source: string
): string {
  const normalized = value.toLowerCase().trim();

  switch (source) {
    case "stripe":
      return PAYMENT_STATUS_MAP[normalized] ?? normalized;
    case "calendly":
      return BOOKING_STATUS_MAP[normalized] ?? normalized;
    default:
      return normalized;
  }
}
