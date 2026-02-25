/**
 * Phone number normalization and comparison utilities.
 * Strips to digits and compares last 10 digits to handle country code variations.
 */

/**
 * Normalize a phone number to digits only.
 * Returns null if the result has fewer than 7 digits (not a valid phone).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Return last 10 digits to strip country codes
  return digits.slice(-10);
}

/**
 * Compare two phone numbers after normalization.
 * Returns true if both normalize to the same last 10 digits.
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const normA = normalizePhone(a);
  const normB = normalizePhone(b);
  if (!normA || !normB) return false;
  return normA === normB;
}
