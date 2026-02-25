/**
 * Phone number normalization and comparison utilities.
 * Uses libphonenumber-js for proper international parsing.
 * Numbers with a "+" prefix are parsed as-is. Numbers without one
 * are assumed to be US by default (configurable via defaultCountry).
 */

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

const DEFAULT_COUNTRY: CountryCode = "US";

/**
 * Normalize a phone number to E.164 format (e.g. "+15558675309").
 *
 * - Numbers starting with "+" are parsed internationally.
 * - Numbers without a country prefix fall back to `defaultCountry`.
 * - Returns null if the input is empty, too short, or unparseable.
 */
export function normalizePhone(
  phone: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY
): string | null {
  if (!phone) return null;

  const trimmed = phone.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;

  return parsed.format("E.164");
}

/**
 * Compare two phone numbers after normalizing to E.164.
 * "+1 (555) 867-5309", "5558675309", and "15558675309" all match.
 * International numbers like "+33 6 12 34 56 78" are handled correctly.
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const normA = normalizePhone(a);
  const normB = normalizePhone(b);
  if (!normA || !normB) return false;
  return normA === normB;
}
