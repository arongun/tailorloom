import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceType } from "@/lib/types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

interface StitchResult {
  customerId: string;
  isNew: boolean;
  matchedBy: "external_id" | "email" | "name" | "none";
}

/**
 * Stitch a row's identity to an existing or new customer.
 *
 * Priority cascade:
 * 1. External ID — match customer_sources by (source, external_id)
 * 2. Email — match customers by email OR customer_sources by external_email
 * 3. Name — if name matches but email differs, flag conflict (don't auto-merge)
 * 4. No match — create new customer
 */
export async function stitchIdentity(
  admin: SupabaseClient,
  source: SourceType,
  externalId: string,
  email: string | null,
  name: string | null
): Promise<StitchResult> {
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
    // Check customers table directly
    const { data: customerByEmail } = await admin
      .from("customers")
      .select("id")
      .eq("org_id", DEFAULT_ORG_ID)
      .eq("email", email)
      .maybeSingle();

    if (customerByEmail) {
      // Link this new source to existing customer
      await linkSourceToCustomer(
        admin,
        customerByEmail.id,
        source,
        externalId,
        email,
        name
      );
      return {
        customerId: customerByEmail.id,
        isNew: false,
        matchedBy: "email",
      };
    }

    // Check customer_sources by external_email
    const { data: sourceByEmail } = await admin
      .from("customer_sources")
      .select("customer_id")
      .eq("external_email", email)
      .limit(1)
      .maybeSingle();

    if (sourceByEmail) {
      await linkSourceToCustomer(
        admin,
        sourceByEmail.customer_id,
        source,
        externalId,
        email,
        name
      );
      return {
        customerId: sourceByEmail.customer_id,
        isNew: false,
        matchedBy: "email",
      };
    }
  }

  // 3. Name match — look for existing customer with same name
  // If found but different email, flag as conflict (don't auto-merge)
  if (name) {
    const { data: customersByName } = await admin
      .from("customers")
      .select("id, email")
      .eq("org_id", DEFAULT_ORG_ID)
      .ilike("name", name)
      .limit(5);

    if (customersByName && customersByName.length === 1) {
      const existingCustomer = customersByName[0];
      // Only flag conflict if the existing customer has a different email
      // If emails match we would have caught it above, so this means different emails
      if (existingCustomer.email && email && existingCustomer.email !== email) {
        // Create new customer (don't auto-merge)
        const newCustomerId = await createCustomer(admin, email, name);
        await linkSourceToCustomer(
          admin,
          newCustomerId,
          source,
          externalId,
          email,
          name
        );

        // Flag conflict
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
    }
  }

  // 4. No match — create new customer
  const newCustomerId = await createCustomer(admin, email, name);
  await linkSourceToCustomer(
    admin,
    newCustomerId,
    source,
    externalId,
    email,
    name
  );

  return { customerId: newCustomerId, isNew: true, matchedBy: "none" };
}

/**
 * Create a new customer record.
 */
async function createCustomer(
  admin: SupabaseClient,
  email: string | null,
  name: string | null
): Promise<string> {
  const { data, error } = await admin
    .from("customers")
    .insert({
      org_id: DEFAULT_ORG_ID,
      email,
      name,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create customer: ${error.message}`);
  return data.id;
}

/**
 * Link a source (external ID) to a customer via customer_sources.
 * Uses upsert on (source, external_id) to prevent duplicates.
 */
async function linkSourceToCustomer(
  admin: SupabaseClient,
  customerId: string,
  source: SourceType,
  externalId: string,
  email: string | null,
  name: string | null
): Promise<void> {
  const { error } = await admin.from("customer_sources").upsert(
    {
      customer_id: customerId,
      source,
      external_id: externalId,
      external_email: email,
      external_name: name,
    },
    { onConflict: "source,external_id" }
  );

  if (error) {
    // Log but don't throw — source linking failure shouldn't block import
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
 * Post-import conflict detection.
 * Looks for customers with matching names but different emails that
 * were created during the same import.
 */
export async function detectPostImportConflicts(
  admin: SupabaseClient,
  importId: string
): Promise<number> {
  // Get all customer_sources created for this import
  const { data: sources } = await admin
    .from("customer_sources")
    .select("customer_id, external_email, external_name")
    .order("created_at", { ascending: false });

  if (!sources || sources.length === 0) return 0;

  // Get the customers that were linked in this import via their records
  // (payments, bookings, or attendance with this import_id)
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

  // Get customer details for this import's customers
  const { data: importCustomers } = await admin
    .from("customers")
    .select("id, name, email")
    .in("id", Array.from(importCustomerIds));

  if (!importCustomers) return 0;

  let conflictsFound = 0;

  // Check for name collisions with different emails across all customers
  for (const customer of importCustomers) {
    if (!customer.name) continue;

    const { data: nameMatches } = await admin
      .from("customers")
      .select("id, email")
      .eq("org_id", DEFAULT_ORG_ID)
      .ilike("name", customer.name)
      .neq("id", customer.id);

    if (!nameMatches) continue;

    for (const match of nameMatches) {
      // Only flag if both have emails and they differ
      if (match.email && customer.email && match.email !== customer.email) {
        // Check if this conflict already exists
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
            customer.name,
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
