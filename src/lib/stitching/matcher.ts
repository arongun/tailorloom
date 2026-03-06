import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SourceType,
  StitchMatchCategory,
  StitchCandidate,
  EnrichableField,
} from "@/lib/types";
import { normalizePhone, phonesMatch } from "./phone-utils";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// Name precedence: higher number = higher priority for full_name updates.
const NAME_SOURCE_PRIORITY: Record<string, number> = {
  crm: 100, stripe: 80, pos: 60, wetravel: 50, calendly: 50,
  passline: 50, attribution: 40, manual: 20,
};

export function shouldUpdateName(currentSource: string | null, incomingSource: string): boolean {
  return (NAME_SOURCE_PRIORITY[incomingSource] ?? 0) >= (NAME_SOURCE_PRIORITY[currentSource ?? ""] ?? 0);
}

interface StitchResult {
  customerId: string;
  isNew: boolean;
  matchedBy: "external_id" | "email" | "phone" | "name" | "none";
}

export interface PreviewStitchResult {
  category: StitchMatchCategory;
  existingCustomerId: string | null;
  existingCustomerName: string | null;
  existingCustomerEmail: string | null;
  confidence: number;
  candidates: StitchCandidate[];
  enrichableFields: EnrichableField[];
}

/**
 * Detect enrichable fields: existing customer has null fields the CSV can fill.
 */
function detectEnrichableFields(
  existing: { full_name: string | null; email: string | null; phone: string | null },
  name: string | null,
  email: string | null,
  phone: string | null
): EnrichableField[] {
  const fields: EnrichableField[] = [];
  if (!existing.full_name && name) {
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
 */
function hasConflictingFields(
  existing: { full_name: string | null; email: string | null },
  name: string | null,
  email: string | null
): boolean {
  if (existing.full_name && name && existing.full_name.toLowerCase() !== name.toLowerCase()) {
    return true;
  }
  if (existing.email && email && existing.email.toLowerCase() !== email.toLowerCase()) {
    return true;
  }
  return false;
}

/**
 * Read-only preview of the stitching cascade — same logic as stitchIdentity
 * but performs NO database writes. Used by the verify step.
 *
 * Cascade: External ID → Email → Phone → Name → New
 */
export async function previewStitchIdentity(
  admin: SupabaseClient,
  source: SourceType,
  externalId: string,
  email: string | null,
  name: string | null,
  phone: string | null
): Promise<PreviewStitchResult> {
  // 1. Check external ID in customer_sources
  if (externalId) {
    const { data: existingSource } = await admin
      .from("customer_sources")
      .select("customer_id, customers(id, full_name, email, phone)")
      .eq("source", source)
      .eq("external_id", externalId)
      .maybeSingle();

    if (existingSource) {
      const cArr = existingSource.customers as unknown as { id: string; full_name: string | null; email: string | null; phone: string | null }[] | null;
      const c = cArr?.[0] ?? null;

      // Check for enrichment opportunity
      if (c) {
        const enrichableFields = detectEnrichableFields(c, name, email, phone);
        if (enrichableFields.length > 0 && !hasConflictingFields(c, name, email)) {
          return {
            category: "enrichment",
            existingCustomerId: existingSource.customer_id,
            existingCustomerName: c.full_name,
            existingCustomerEmail: c.email,
            confidence: 1.0,
            candidates: [],
            enrichableFields,
          };
        }
      }

      return {
        category: "external_id",
        existingCustomerId: existingSource.customer_id,
        existingCustomerName: c?.full_name ?? null,
        existingCustomerEmail: c?.email ?? null,
        confidence: 1.0,
        candidates: [],
        enrichableFields: [],
      };
    }
  }

  // 2. Check email
  if (email) {
    const { data: customerByEmail } = await admin
      .from("customers")
      .select("id, full_name, email, phone")
      .eq("org_id", DEFAULT_ORG_ID)
      .eq("email", email)
      .maybeSingle();

    if (customerByEmail) {
      const enrichableFields = detectEnrichableFields(customerByEmail, name, email, phone);
      if (enrichableFields.length > 0 && !hasConflictingFields(customerByEmail, name, email)) {
        return {
          category: "enrichment",
          existingCustomerId: customerByEmail.id,
          existingCustomerName: customerByEmail.full_name,
          existingCustomerEmail: customerByEmail.email,
          confidence: 0.95,
          candidates: [],
          enrichableFields,
        };
      }

      // Detect name mismatch: email matches but names differ
      if (
        name &&
        customerByEmail.full_name &&
        customerByEmail.full_name.toLowerCase() !== name.toLowerCase()
      ) {
        return {
          category: "email_name_mismatch",
          existingCustomerId: customerByEmail.id,
          existingCustomerName: customerByEmail.full_name,
          existingCustomerEmail: customerByEmail.email,
          confidence: 0.95,
          candidates: [],
          enrichableFields: [],
        };
      }

      return {
        category: "email",
        existingCustomerId: customerByEmail.id,
        existingCustomerName: customerByEmail.full_name,
        existingCustomerEmail: customerByEmail.email,
        confidence: 0.95,
        candidates: [],
        enrichableFields: [],
      };
    }

    const { data: sourceByEmail } = await admin
      .from("customer_sources")
      .select("customer_id, customers(id, full_name, email, phone)")
      .eq("external_email", email)
      .limit(1)
      .maybeSingle();

    if (sourceByEmail) {
      const cArr = sourceByEmail.customers as unknown as { id: string; full_name: string | null; email: string | null; phone: string | null }[] | null;
      const c = cArr?.[0] ?? null;

      if (c) {
        const enrichableFields = detectEnrichableFields(c, name, email, phone);
        if (enrichableFields.length > 0 && !hasConflictingFields(c, name, email)) {
          return {
            category: "enrichment",
            existingCustomerId: sourceByEmail.customer_id,
            existingCustomerName: c.full_name,
            existingCustomerEmail: c.email,
            confidence: 0.9,
            candidates: [],
            enrichableFields,
          };
        }
      }

      // Detect name mismatch on customer_sources email match
      if (
        name &&
        c?.full_name &&
        c.full_name.toLowerCase() !== name.toLowerCase()
      ) {
        return {
          category: "email_name_mismatch",
          existingCustomerId: sourceByEmail.customer_id,
          existingCustomerName: c.full_name,
          existingCustomerEmail: c.email,
          confidence: 0.9,
          candidates: [],
          enrichableFields: [],
        };
      }

      return {
        category: "email",
        existingCustomerId: sourceByEmail.customer_id,
        existingCustomerName: c?.full_name ?? null,
        existingCustomerEmail: c?.email ?? null,
        confidence: 0.9,
        candidates: [],
        enrichableFields: [],
      };
    }
  }

  // 3. Phone match (NEW)
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const { data: customersByPhone } = await admin
      .from("customers")
      .select("id, full_name, email, phone")
      .eq("org_id", DEFAULT_ORG_ID)
      .not("phone", "is", null);

    if (customersByPhone) {
      const phoneMatches = customersByPhone.filter((c) =>
        phonesMatch(c.phone, phone)
      );

      if (phoneMatches.length === 1) {
        const match = phoneMatches[0];
        const enrichableFields = detectEnrichableFields(match, name, email, phone);
        if (enrichableFields.length > 0 && !hasConflictingFields(match, name, email)) {
          return {
            category: "enrichment",
            existingCustomerId: match.id,
            existingCustomerName: match.full_name,
            existingCustomerEmail: match.email,
            confidence: 0.75,
            candidates: [],
            enrichableFields,
          };
        }
        return {
          category: "phone",
          existingCustomerId: match.id,
          existingCustomerName: match.full_name,
          existingCustomerEmail: match.email,
          confidence: 0.75,
          candidates: [{
            customerId: match.id,
            customerName: match.full_name,
            customerEmail: match.email,
            customerPhone: match.phone,
            matchedBy: "phone",
            confidence: 0.75,
          }],
          enrichableFields: [],
        };
      }

      if (phoneMatches.length > 1) {
        return {
          category: "phone",
          existingCustomerId: phoneMatches[0].id,
          existingCustomerName: phoneMatches[0].full_name,
          existingCustomerEmail: phoneMatches[0].email,
          confidence: 0.6,
          candidates: phoneMatches.map((m) => ({
            customerId: m.id,
            customerName: m.full_name,
            customerEmail: m.email,
            customerPhone: m.phone,
            matchedBy: "phone" as const,
            confidence: 0.6,
          })),
          enrichableFields: [],
        };
      }
    }
  }

  // 4. Name match (FIXED) — any name match goes to uncertain, regardless of email
  if (name) {
    const { data: customersByName } = await admin
      .from("customers")
      .select("id, email, full_name, phone")
      .eq("org_id", DEFAULT_ORG_ID)
      .ilike("full_name", name)
      .limit(5);

    if (customersByName && customersByName.length > 0) {
      if (customersByName.length === 1) {
        const existing = customersByName[0];
        // If existing has different email AND both have emails → name_conflict
        // Otherwise → name_match (uncertain)
        const isConflict = existing.email && email && existing.email.toLowerCase() !== email.toLowerCase();
        const category: StitchMatchCategory = isConflict ? "name_conflict" : "name_match";

        return {
          category,
          existingCustomerId: existing.id,
          existingCustomerName: existing.full_name,
          existingCustomerEmail: existing.email,
          confidence: 0.65,
          candidates: [{
            customerId: existing.id,
            customerName: existing.full_name,
            customerEmail: existing.email,
            customerPhone: existing.phone,
            matchedBy: "name",
            confidence: 0.65,
          }],
          enrichableFields: [],
        };
      }

      // Multiple name matches
      return {
        category: "name_match",
        existingCustomerId: customersByName[0].id,
        existingCustomerName: customersByName[0].full_name,
        existingCustomerEmail: customersByName[0].email,
        confidence: 0.5,
        candidates: customersByName.map((c) => ({
          customerId: c.id,
          customerName: c.full_name,
          customerEmail: c.email,
          customerPhone: c.phone,
          matchedBy: "name" as const,
          confidence: 0.5,
        })),
        enrichableFields: [],
      };
    }
  }

  // 5. No match — new customer
  return {
    category: "new",
    existingCustomerId: null,
    existingCustomerName: null,
    existingCustomerEmail: null,
    confidence: 0,
    candidates: [],
    enrichableFields: [],
  };
}

/**
 * Check if a row already exists in the source-specific table.
 * Returns true if a record with this external ID + source already exists.
 */
export async function checkDuplicateRow(
  admin: SupabaseClient,
  source: SourceType,
  externalId: string
): Promise<boolean> {
  let table: string;
  let idColumn: string;
  let sourceFilter: string;

  switch (source) {
    case "stripe":
      table = "payments";
      idColumn = "external_payment_id";
      sourceFilter = "stripe";
      break;
    case "pos":
      table = "payments";
      idColumn = "external_payment_id";
      sourceFilter = "pos";
      break;
    case "calendly":
      table = "bookings";
      idColumn = "external_booking_id";
      sourceFilter = "calendly";
      break;
    case "wetravel":
      table = "bookings";
      idColumn = "external_booking_id";
      sourceFilter = "wetravel";
      break;
    case "passline":
      table = "attendance";
      idColumn = "external_attendance_id";
      sourceFilter = "passline";
      break;
    default:
      return false;
  }

  const { data } = await admin
    .from(table)
    .select("id")
    .eq(idColumn, externalId)
    .eq("source", sourceFilter)
    .limit(1)
    .maybeSingle();

  return data !== null;
}

/**
 * Stitch a row's identity to an existing or new customer.
 *
 * Priority cascade:
 * 1. External ID — match customer_sources by (source, external_id)
 * 2. Email — match customers by email OR customer_sources by external_email
 * 3. Phone — match customers by normalized phone number
 * 4. Name — if name matches but email differs, flag conflict (don't auto-merge)
 * 5. No match — create new customer
 *
 * When `forceCustomerId` is set, skip cascade and link directly to that customer.
 * When `enrichFields` is provided, update null fields on the target customer with COALESCE.
 */
export async function stitchIdentity(
  admin: SupabaseClient,
  source: SourceType,
  externalId: string,
  email: string | null,
  name: string | null,
  phone: string | null,
  forceCustomerId?: string,
  enrichFields?: { full_name?: string; email?: string; phone?: string },
  forceNameUpdate?: string,
  importId?: string
): Promise<StitchResult> {
  // If user explicitly chose to merge or accept enrichment, skip cascade
  if (forceCustomerId) {
    // Apply enrichment if provided (only fills null fields)
    if (enrichFields && Object.keys(enrichFields).length > 0) {
      await enrichCustomer(admin, forceCustomerId, enrichFields);
    }

    // If merge_update_name was chosen, force-overwrite the customer's name
    if (forceNameUpdate) {
      await admin
        .from("customers")
        .update({ full_name: forceNameUpdate, updated_at: new Date().toISOString() })
        .eq("id", forceCustomerId);
    }

    await linkSourceToCustomer(
      admin,
      forceCustomerId,
      source,
      externalId,
      email,
      name,
      importId
    );
    return {
      customerId: forceCustomerId,
      isNew: false,
      matchedBy: "email",
    };
  }

  // 1. Check external ID in customer_sources
  if (externalId) {
    const { data: existingSource } = await admin
      .from("customer_sources")
      .select("customer_id")
      .eq("source", source)
      .eq("external_id", externalId)
      .maybeSingle();

    if (existingSource) {
      return {
        customerId: existingSource.customer_id,
        isNew: false,
        matchedBy: "external_id",
      };
    }
  }

  // 2. Check email — in customers table and customer_sources
  if (email) {
    const { data: customerByEmail } = await admin
      .from("customers")
      .select("id, full_name, name_source")
      .eq("org_id", DEFAULT_ORG_ID)
      .eq("email", email)
      .maybeSingle();

    if (customerByEmail) {
      // Apply name precedence
      if (name && (!customerByEmail.full_name || shouldUpdateName(customerByEmail.name_source, source))) {
        await admin.from("customers").update({
          full_name: name,
          name_source: source,
          updated_at: new Date().toISOString(),
        }).eq("id", customerByEmail.id);
      }

      await linkSourceToCustomer(
        admin,
        customerByEmail.id,
        source,
        externalId,
        email,
        name,
        importId
      );
      return {
        customerId: customerByEmail.id,
        isNew: false,
        matchedBy: "email",
      };
    }

    const { data: sourceByEmail } = await admin
      .from("customer_sources")
      .select("customer_id")
      .eq("external_email", email)
      .limit(1)
      .maybeSingle();

    if (sourceByEmail) {
      // Apply name precedence on source-email match too
      if (name) {
        const { data: existCust } = await admin
          .from("customers")
          .select("full_name, name_source")
          .eq("id", sourceByEmail.customer_id)
          .single();
        if (existCust && (!existCust.full_name || shouldUpdateName(existCust.name_source, source))) {
          await admin.from("customers").update({
            full_name: name,
            name_source: source,
            updated_at: new Date().toISOString(),
          }).eq("id", sourceByEmail.customer_id);
        }
      }

      await linkSourceToCustomer(
        admin,
        sourceByEmail.customer_id,
        source,
        externalId,
        email,
        name,
        importId
      );
      return {
        customerId: sourceByEmail.customer_id,
        isNew: false,
        matchedBy: "email",
      };
    }
  }

  // 3. Phone match
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const { data: customersByPhone } = await admin
      .from("customers")
      .select("id, phone")
      .eq("org_id", DEFAULT_ORG_ID)
      .not("phone", "is", null);

    if (customersByPhone) {
      const phoneMatches = customersByPhone.filter((c) =>
        phonesMatch(c.phone, phone)
      );

      if (phoneMatches.length === 1) {
        await linkSourceToCustomer(
          admin,
          phoneMatches[0].id,
          source,
          externalId,
          email,
          name,
          importId
        );
        return {
          customerId: phoneMatches[0].id,
          isNew: false,
          matchedBy: "phone",
        };
      }
      // Multiple phone matches — don't auto-merge, fall through to name/new
    }
  }

  // 4. Name match — look for existing customer with same name
  if (name) {
    const { data: customersByName } = await admin
      .from("customers")
      .select("id, email")
      .eq("org_id", DEFAULT_ORG_ID)
      .ilike("full_name", name)
      .limit(5);

    if (customersByName && customersByName.length === 1) {
      const existingCustomer = customersByName[0];
      // Flag conflict if both have emails and they differ
      if (existingCustomer.email && email && existingCustomer.email !== email) {
        const newCustomerId = await createCustomer(admin, email, name, phone, source);
        await linkSourceToCustomer(
          admin,
          newCustomerId,
          source,
          externalId,
          email,
          name,
          importId
        );

        await flagConflict(
          admin,
          existingCustomer.id,
          newCustomerId,
          "name",
          name,
          0.6
        );

        return { customerId: newCustomerId, isNew: true, matchedBy: "name" };
      }
      // If no email conflict (e.g., CSV has no email), just create new
      // (user already made a decision in the preview step)
    }
  }

  // 5. No match — create new customer
  const newCustomerId = await createCustomer(admin, email, name, phone, source);
  await linkSourceToCustomer(
    admin,
    newCustomerId,
    source,
    externalId,
    email,
    name,
    importId
  );

  return { customerId: newCustomerId, isNew: true, matchedBy: "none" };
}

/**
 * Create a new customer record.
 */
async function createCustomer(
  admin: SupabaseClient,
  email: string | null,
  name: string | null,
  phone?: string | null,
  source?: string
): Promise<string> {
  const { data, error } = await admin
    .from("customers")
    .insert({
      org_id: DEFAULT_ORG_ID,
      email,
      full_name: name,
      phone: phone ?? null,
      name_source: name ? (source ?? null) : null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create customer: ${error.message}`);
  return data.id;
}

/**
 * Enrich a customer by filling in null fields with new values.
 * Uses COALESCE-style logic: only update fields that are currently null.
 */
async function enrichCustomer(
  admin: SupabaseClient,
  customerId: string,
  fields: { full_name?: string; email?: string; phone?: string }
): Promise<void> {
  // Fetch current values to only update nulls
  const { data: current } = await admin
    .from("customers")
    .select("full_name, email, phone")
    .eq("id", customerId)
    .single();

  if (!current) return;

  const updates: Record<string, string> = {};
  if (!current.full_name && fields.full_name) updates.full_name = fields.full_name;
  if (!current.email && fields.email) updates.email = fields.email;
  if (!current.phone && fields.phone) updates.phone = fields.phone;

  if (Object.keys(updates).length === 0) return;

  const { error } = await admin
    .from("customers")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", customerId);

  if (error) {
    console.error(`Failed to enrich customer: ${error.message}`);
  }
}

/**
 * Link a source (external ID) to a customer via customer_sources.
 * Uses insert-then-update to preserve original import_id provenance.
 */
async function linkSourceToCustomer(
  admin: SupabaseClient,
  customerId: string,
  source: SourceType,
  externalId: string,
  email: string | null,
  name: string | null,
  importId?: string
): Promise<void> {
  const { error } = await admin.from("customer_sources").insert({
    customer_id: customerId,
    source,
    external_id: externalId,
    external_email: email,
    external_name: name,
    import_id: importId ?? null,
  });

  if (error?.code === "23505") {
    // Conflict on (source, external_id) — update email/name only.
    // PRESERVE original import_id to maintain "first import" provenance.
    await admin
      .from("customer_sources")
      .update({ external_email: email, external_name: name })
      .eq("source", source)
      .eq("external_id", externalId);
  } else if (error) {
    console.error(`Failed to link source: ${error.message}`);
  }
}

/**
 * Flag a stitching conflict between two customers.
 */
async function flagConflict(
  admin: SupabaseClient,
  customerAId: string,
  customerBId: string,
  matchField: string,
  matchValue: string | null,
  confidence: number,
  importId?: string
): Promise<void> {
  const { error } = await admin.from("stitching_conflicts").insert({
    org_id: DEFAULT_ORG_ID,
    customer_a_id: customerAId,
    customer_b_id: customerBId,
    match_field: matchField,
    match_value: matchValue,
    confidence,
    status: "pending",
    import_id: importId ?? null,
  });

  if (error) {
    console.error(`Failed to flag conflict: ${error.message}`);
  }
}

/**
 * Match a CRM row to an existing or new customer.
 * Cascade: email → phone → member_id (via POS customer_sources) → create new
 * Does NOT write to customer_sources (CRM doesn't use source links).
 */
export async function matchCRMCustomer(
  admin: SupabaseClient,
  email: string | null,
  phone: string | null,
  memberId: string | null,
  name: string | null
): Promise<{ customerId: string; isNew: boolean }> {
  // 1. Email lookup
  if (email) {
    const { data } = await admin
      .from("customers")
      .select("id")
      .eq("org_id", DEFAULT_ORG_ID)
      .eq("email", email)
      .maybeSingle();
    if (data) return { customerId: data.id, isNew: false };
  }

  // 2. Phone lookup
  if (phone) {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone) {
      const { data: customersByPhone } = await admin
        .from("customers")
        .select("id, phone")
        .eq("org_id", DEFAULT_ORG_ID)
        .not("phone", "is", null);

      if (customersByPhone) {
        const phoneMatches = customersByPhone.filter((c) =>
          phonesMatch(c.phone, phone)
        );
        if (phoneMatches.length === 1) {
          return { customerId: phoneMatches[0].id, isNew: false };
        }
      }
    }
  }

  // 3. Member ID lookup (reuse existing POS membership links)
  if (memberId) {
    const { data } = await admin
      .from("customer_sources")
      .select("customer_id")
      .eq("source", "pos")
      .eq("external_id", memberId)
      .maybeSingle();
    if (data) return { customerId: data.customer_id, isNew: false };
  }

  // 4. No match — create new customer
  const customerId = await createCustomer(admin, email, name, phone);
  return { customerId, isNew: true };
}

/**
 * Match an attribution row to an existing or new customer.
 * Cascade: email → phone → create new
 * Does NOT write to customer_sources.
 * Attribution has lowest priority — only updates name if shouldUpdateName allows it.
 */
export async function matchAttributionCustomer(
  admin: SupabaseClient,
  email: string | null,
  phone: string | null,
  name: string | null = null
): Promise<{ customerId: string; isNew: boolean }> {
  // 1. Email lookup
  if (email) {
    const { data } = await admin
      .from("customers")
      .select("id, full_name, name_source")
      .eq("org_id", DEFAULT_ORG_ID)
      .eq("email", email)
      .maybeSingle();
    if (data) {
      // Attribution has low priority — only update if shouldUpdateName allows
      if (name && (!data.full_name || shouldUpdateName(data.name_source, "attribution"))) {
        await admin.from("customers").update({
          full_name: name,
          name_source: "attribution",
          updated_at: new Date().toISOString(),
        }).eq("id", data.id);
      }
      return { customerId: data.id, isNew: false };
    }
  }

  // 2. Phone lookup
  if (phone) {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone) {
      const { data: customersByPhone } = await admin
        .from("customers")
        .select("id, phone")
        .eq("org_id", DEFAULT_ORG_ID)
        .not("phone", "is", null);

      if (customersByPhone) {
        const phoneMatches = customersByPhone.filter((c) =>
          phonesMatch(c.phone, phone)
        );
        if (phoneMatches.length === 1) {
          return { customerId: phoneMatches[0].id, isNew: false };
        }
      }
    }
  }

  // 3. No match — create new customer
  const customerId = await createCustomer(admin, email, name, phone, "attribution");
  return { customerId, isNew: true };
}

/**
 * Post-import conflict detection.
 * Looks for customers with matching names but different emails that
 * were created during the same import.
 */
export async function detectPostImportConflicts(
  admin: SupabaseClient,
  importId: string
): Promise<number> {
  const { data: sources } = await admin
    .from("customer_sources")
    .select("customer_id, external_email, external_name")
    .order("created_at", { ascending: false });

  if (!sources || sources.length === 0) return 0;

  const tables = ["payments", "bookings", "attendance"] as const;
  const importCustomerIds = new Set<string>();

  for (const table of tables) {
    const { data } = await admin
      .from(table)
      .select("customer_id")
      .eq("import_id", importId)
      .not("customer_id", "is", null);

    if (data) {
      for (const row of data) {
        if (row.customer_id) importCustomerIds.add(row.customer_id);
      }
    }
  }

  if (importCustomerIds.size === 0) return 0;

  const { data: importCustomers } = await admin
    .from("customers")
    .select("id, full_name, email")
    .in("id", Array.from(importCustomerIds));

  if (!importCustomers) return 0;

  let conflictsFound = 0;

  for (const customer of importCustomers) {
    if (!customer.full_name) continue;

    const { data: nameMatches } = await admin
      .from("customers")
      .select("id, email")
      .eq("org_id", DEFAULT_ORG_ID)
      .ilike("full_name", customer.full_name)
      .neq("id", customer.id);

    if (!nameMatches) continue;

    for (const match of nameMatches) {
      if (match.email && customer.email && match.email !== customer.email) {
        const { data: existingConflict } = await admin
          .from("stitching_conflicts")
          .select("id")
          .or(
            `and(customer_a_id.eq.${customer.id},customer_b_id.eq.${match.id}),and(customer_a_id.eq.${match.id},customer_b_id.eq.${customer.id})`
          )
          .maybeSingle();

        if (!existingConflict) {
          await flagConflict(
            admin,
            customer.id,
            match.id,
            "name",
            customer.full_name,
            0.5,
            importId
          );
          conflictsFound++;
        }
      }
    }
  }

  return conflictsFound;
}
