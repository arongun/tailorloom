import type { EnrichableField } from "@/lib/types";

/**
 * Check if a customer's full_name is actually just their email address stored as name.
 * Only returns true when fullName literally equals the customer's own email.
 */
export function isPlaceholderName(
  fullName: string,
  customerEmail: string | null
): boolean {
  if (!customerEmail) return false;
  return fullName.trim().toLowerCase() === customerEmail.trim().toLowerCase();
}

/**
 * Normalize a name for comparison:
 * - lowercase, trim, collapse whitespace
 * - convert "Last, First" → "First Last"
 * - strip diacritics (Sánchez → sanchez)
 * - normalize punctuation (periods, hyphens, apostrophes)
 */
export function normalizeName(s: string): string {
  let n = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[.']/g, "") // strip periods and apostrophes
    .replace(/\s+/g, " "); // collapse whitespace

  // Convert "Last, First" → "First Last"
  const commaMatch = n.match(/^(.+?),\s*(.+)$/);
  if (commaMatch) {
    n = `${commaMatch[2]} ${commaMatch[1]}`;
  }

  return n;
}

/**
 * Check if two names match accounting for abbreviations.
 * Rules: both must have 2+ tokens, last name(s) must exact-match,
 * and only one token pair may be initial vs full name.
 * An initial is a single character (e.g., "A" matches "Ana").
 */
function abbreviationMatch(a: string, b: string): boolean {
  const tokensA = a.split(" ");
  const tokensB = b.split(" ");

  // Both must have 2+ tokens
  if (tokensA.length < 2 || tokensB.length < 2) return false;
  // Must have same number of tokens
  if (tokensA.length !== tokensB.length) return false;

  let initialPairs = 0;
  for (let i = 0; i < tokensA.length; i++) {
    const ta = tokensA[i];
    const tb = tokensB[i];
    if (ta === tb) continue;

    // Check if one is an initial of the other
    const aIsInitial = ta.length === 1;
    const bIsInitial = tb.length === 1;

    if (aIsInitial && tb.startsWith(ta)) {
      initialPairs++;
    } else if (bIsInitial && ta.startsWith(tb)) {
      initialPairs++;
    } else {
      return false; // Non-matching, non-initial token
    }
  }

  // At least one initial pair, and only one allowed
  return initialPairs >= 1 && initialPairs <= 1;
}

/**
 * Determine if two names should be considered the same person.
 * 1. Placeholder check: existing name is the customer's email → true
 * 2. Normalized exact match (handles case, "Last, First", diacritics)
 * 3. Abbreviation match (A. Mendoza ↔ Ana Mendoza)
 */
export function namesMatch(
  existingName: string,
  csvName: string,
  existingEmail?: string | null
): boolean {
  // 1a. Placeholder: existing name is literally the customer's own email
  if (existingEmail && isPlaceholderName(existingName, existingEmail)) {
    return true;
  }
  // 1b. Placeholder: CSV name is the email (POS data often stores email as name)
  if (existingEmail && isPlaceholderName(csvName, existingEmail)) {
    return true;
  }
  // 1c. CSV name looks like an email address → treat as no real name
  if (csvName.includes("@")) {
    return true;
  }

  // 2. Normalized exact match
  const normExisting = normalizeName(existingName);
  const normCsv = normalizeName(csvName);
  if (normExisting === normCsv) return true;

  // 3. Abbreviation match
  if (abbreviationMatch(normExisting, normCsv)) return true;

  return false;
}

/**
 * Detect enrichable fields: existing customer has null fields the CSV can fill.
 * Placeholder names (email-as-name) are treated as null → enrichable.
 */
export function detectEnrichableFields(
  existing: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  },
  name: string | null,
  email: string | null,
  phone: string | null
): EnrichableField[] {
  const fields: EnrichableField[] = [];

  // Treat placeholder names (email stored as name) as null
  const existingNameIsPlaceholder =
    existing.full_name && isPlaceholderName(existing.full_name, existing.email);
  if ((!existing.full_name || existingNameIsPlaceholder) && name) {
    fields.push({ field: "full_name", existingValue: null, newValue: name });
  }
  if (!existing.email && email) {
    fields.push({ field: "email", existingValue: null, newValue: email });
  }
  if (!existing.phone && phone) {
    fields.push({ field: "phone", existingValue: null, newValue: phone });
  }
  return fields;
}

/**
 * Check if there are conflicting fields (existing has a value AND CSV has a DIFFERENT value).
 * Uses namesMatch() for name comparison instead of raw toLowerCase().
 */
export function hasConflictingFields(
  existing: { full_name: string | null; email: string | null },
  name: string | null,
  email: string | null,
  existingEmail?: string | null
): boolean {
  if (existing.full_name && name) {
    if (!namesMatch(existing.full_name, name, existingEmail ?? existing.email)) {
      return true;
    }
  }
  if (
    existing.email &&
    email &&
    existing.email.toLowerCase() !== email.toLowerCase()
  ) {
    return true;
  }
  return false;
}
