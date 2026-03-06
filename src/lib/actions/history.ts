"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shouldUpdateName } from "@/lib/stitching/matcher";
import type {
  SourceType,
  ImportHistory,
  ImportError,
  ConflictStatus,
} from "@/lib/types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// ─── Types ─────────────────────────────────────────────────

export interface ImportHistoryRow {
  id: string;
  source: SourceType;
  file_name: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_rows: number;
  status: ImportHistory["status"];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ConflictWithCustomers {
  id: string;
  customer_a_id: string;
  customer_a_name: string | null;
  customer_a_email: string | null;
  customer_b_id: string;
  customer_b_name: string | null;
  customer_b_email: string | null;
  match_field: string;
  match_value: string | null;
  confidence: number | null;
  status: ConflictStatus;
  created_at: string;
}

// ─── Import History ────────────────────────────────────────

export async function getImportHistory(options?: {
  limit?: number;
  offset?: number;
  source?: SourceType;
}): Promise<{ imports: ImportHistoryRow[]; total: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  let query = admin
    .from("import_history")
    .select(
      "id, source, file_name, total_rows, imported_rows, skipped_rows, error_rows, status, started_at, completed_at, created_at",
      { count: "exact" }
    )
    .eq("org_id", DEFAULT_ORG_ID)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.source) {
    query = query.eq("source", options.source);
  }

  const { data, count, error } = await query;

  if (error) throw new Error(`Failed to fetch import history: ${error.message}`);

  return {
    imports: (data ?? []) as ImportHistoryRow[],
    total: count ?? 0,
  };
}

// ─── Import Row Viewer ────────────────────────────────────

const SOURCE_TABLE: Record<string, string> = {
  stripe: "payments",
  pos: "payments",
  calendly: "bookings",
  passline: "attendance",
  wetravel: "payments",
  crm: "crm_enrichments",
  attribution: "customer_attribution",
};

export async function getImportRows(
  importId: string
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  // Get the import record to determine source
  const { data: imp, error: impError } = await admin
    .from("import_history")
    .select("source")
    .eq("id", importId)
    .eq("org_id", DEFAULT_ORG_ID)
    .single();

  if (impError || !imp) throw new Error("Import not found");

  const table = SOURCE_TABLE[imp.source];
  if (!table) throw new Error(`Unknown source: ${imp.source}`);

  const { data, error } = await admin
    .from(table)
    .select("raw_data")
    .eq("import_id", importId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch rows: ${error.message}`);

  const rows: Record<string, string>[] = (data ?? []).map(
    (r: { raw_data: Record<string, string> }) => r.raw_data
  );

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  return { headers, rows };
}

// ─── Import Metadata (for View dialog) ───────────────────

export async function getImportMetadata(importId: string): Promise<{
  column_mapping: Record<string, string> | null;
  errors: ImportError[] | null;
  source: SourceType;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("import_history")
    .select("column_mapping, errors, source")
    .eq("id", importId)
    .eq("org_id", DEFAULT_ORG_ID)
    .single();

  if (error || !data) throw new Error("Import not found");

  return {
    column_mapping: data.column_mapping as Record<string, string> | null,
    errors: data.errors as ImportError[] | null,
    source: data.source as SourceType,
  };
}

// ─── Conflicts ─────────────────────────────────────────────

export async function getStitchingConflicts(options?: {
  limit?: number;
  offset?: number;
  status?: ConflictStatus | "all";
}): Promise<{ conflicts: ConflictWithCustomers[]; total: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const statusFilter = options?.status ?? "all";

  let query = admin
    .from("stitching_conflicts")
    .select(
      "id, customer_a_id, customer_b_id, match_field, match_value, confidence, status, created_at",
      { count: "exact" }
    )
    .eq("org_id", DEFAULT_ORG_ID)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data: conflicts, count, error } = await query;

  if (error) throw new Error(`Failed to fetch conflicts: ${error.message}`);
  if (!conflicts || conflicts.length === 0) {
    return { conflicts: [], total: count ?? 0 };
  }

  // Fetch customer details for both sides
  const customerIds = new Set<string>();
  for (const c of conflicts) {
    customerIds.add(c.customer_a_id);
    customerIds.add(c.customer_b_id);
  }

  const { data: customers } = await admin
    .from("customers")
    .select("id, full_name, email")
    .in("id", Array.from(customerIds));

  const customerMap = new Map(
    (customers ?? []).map((c: { id: string; full_name: string | null; email: string | null }) => [c.id, c])
  );

  const enriched: ConflictWithCustomers[] = conflicts.map((c: { id: string; customer_a_id: string; customer_b_id: string; match_field: string; match_value: string | null; confidence: number | null; status: string; created_at: string }) => {
    const a = customerMap.get(c.customer_a_id);
    const b = customerMap.get(c.customer_b_id);
    return {
      id: c.id,
      customer_a_id: c.customer_a_id,
      customer_a_name: a?.full_name ?? null,
      customer_a_email: a?.email ?? null,
      customer_b_id: c.customer_b_id,
      customer_b_name: b?.full_name ?? null,
      customer_b_email: b?.email ?? null,
      match_field: c.match_field,
      match_value: c.match_value,
      confidence: c.confidence,
      status: c.status as ConflictStatus,
      created_at: c.created_at,
    };
  });

  return {
    conflicts: enriched,
    total: count ?? 0,
  };
}

// ─── Resolve Conflict ──────────────────────────────────────

/**
 * Resolve a stitching conflict by merging or dismissing.
 *
 * When merged:
 * 1. Reassign all customer_sources from B → A
 * 2. Reassign all payments from B → A
 * 3. Reassign all bookings from B → A
 * 4. Reassign all attendance from B → A
 * 5. Fill in missing name/email on A from B
 * 6. Delete customer B
 * 7. Mark conflict as "merged"
 *
 * When dismissed:
 * 1. Mark conflict as "dismissed"
 */
export async function resolveConflict(
  conflictId: string,
  resolution: "merged" | "dismissed"
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  // Fetch the conflict
  const { data: conflict, error: fetchError } = await admin
    .from("stitching_conflicts")
    .select("*")
    .eq("id", conflictId)
    .single();

  if (fetchError || !conflict) {
    throw new Error("Conflict not found");
  }

  if (conflict.status !== "pending") {
    throw new Error("Conflict already resolved");
  }

  if (resolution === "dismissed") {
    await admin
      .from("stitching_conflicts")
      .update({
        status: "dismissed",
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", conflictId);
    return;
  }

  // ─── Merge: A is the target, B gets absorbed ─────────────

  const keepId = conflict.customer_a_id;
  const removeId = conflict.customer_b_id;

  // 1. Reassign customer_sources
  await admin
    .from("customer_sources")
    .update({ customer_id: keepId })
    .eq("customer_id", removeId);

  // 2. Reassign payments
  await admin
    .from("payments")
    .update({ customer_id: keepId })
    .eq("customer_id", removeId);

  // 3. Reassign bookings
  await admin
    .from("bookings")
    .update({ customer_id: keepId })
    .eq("customer_id", removeId);

  // 4. Reassign attendance
  await admin
    .from("attendance")
    .update({ customer_id: keepId })
    .eq("customer_id", removeId);

  // 5. Fill in missing fields on A from B (with name precedence)
  const { data: customerA } = await admin
    .from("customers")
    .select("full_name, email, phone, name_source")
    .eq("id", keepId)
    .single();

  const { data: customerB } = await admin
    .from("customers")
    .select("full_name, email, phone, name_source")
    .eq("id", removeId)
    .single();

  if (customerA && customerB) {
    const updates: Record<string, string> = {};
    // Use name precedence to decide which name to keep
    if (customerB.full_name) {
      if (!customerA.full_name || shouldUpdateName(customerA.name_source, customerB.name_source ?? "")) {
        updates.full_name = customerB.full_name;
        updates.name_source = customerB.name_source ?? "";
      }
    }
    if (!customerA.email && customerB.email) updates.email = customerB.email;
    if (!customerA.phone && customerB.phone) updates.phone = customerB.phone;

    if (Object.keys(updates).length > 0) {
      await admin.from("customers").update(updates).eq("id", keepId);
    }
  }

  // 6. Delete customer B
  await admin.from("customers").delete().eq("id", removeId);

  // 7. Mark conflict as merged
  await admin
    .from("stitching_conflicts")
    .update({
      status: "merged",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", conflictId);

  // Also resolve any other pending conflicts involving the removed customer
  await admin
    .from("stitching_conflicts")
    .update({
      status: "merged",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("status", "pending")
    .or(`customer_a_id.eq.${removeId},customer_b_id.eq.${removeId}`);
}

// ─── Revert Import ───────────────────────────────────────

/**
 * Revert a completed import by deleting all records created by it.
 *
 * 1. Delete payments, bookings, attendance with this import_id
 * 2. Delete customer_sources whose customers ONLY have sources from this import
 * 3. Delete customers that have no remaining customer_sources after cleanup
 * 4. Delete stitching_conflicts linked to this import
 * 5. Mark import_history as "reverted"
 */
export async function revertImport(importId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  // Verify the import exists and is revertible
  const { data: imp, error: fetchError } = await admin
    .from("import_history")
    .select("id, status, org_id")
    .eq("id", importId)
    .single();

  if (fetchError || !imp) throw new Error("Import not found");
  if (imp.status === "reverted") throw new Error("Import already reverted");
  if (imp.status === "processing") throw new Error("Import still processing");

  // 1. Find customers affected by this import (via all provenance tables)
  const [paymentsRes, bookingsRes, attendanceRes, crmRes, attrRes, sourcesRes] = await Promise.all([
    admin.from("payments").select("customer_id").eq("import_id", importId),
    admin.from("bookings").select("customer_id").eq("import_id", importId),
    admin.from("attendance").select("customer_id").eq("import_id", importId),
    admin.from("crm_enrichments").select("customer_id").eq("import_id", importId),
    admin.from("customer_attribution").select("customer_id").eq("import_id", importId),
    admin.from("customer_sources").select("customer_id").eq("import_id", importId),
  ]);

  const affectedCustomerIds = new Set<string>();
  for (const row of [
    ...(paymentsRes.data ?? []),
    ...(bookingsRes.data ?? []),
    ...(attendanceRes.data ?? []),
    ...(crmRes.data ?? []),
    ...(attrRes.data ?? []),
    ...(sourcesRes.data ?? []),
  ]) {
    if (row.customer_id) affectedCustomerIds.add(row.customer_id);
  }

  // 2. Delete source data rows + source links from this import
  await Promise.all([
    admin.from("payments").delete().eq("import_id", importId),
    admin.from("bookings").delete().eq("import_id", importId),
    admin.from("attendance").delete().eq("import_id", importId),
    admin.from("crm_enrichments").delete().eq("import_id", importId),
    admin.from("customer_attribution").delete().eq("import_id", importId),
    admin.from("customer_sources").delete().eq("import_id", importId),
  ]);

  // 3. Delete stitching conflicts linked to this import
  await admin.from("stitching_conflicts").delete().eq("import_id", importId);

  // 4. For each affected customer, check if they still have data from other imports
  //    If not, delete the customer and their customer_sources
  if (affectedCustomerIds.size > 0) {
    for (const customerId of affectedCustomerIds) {
      const [rp, rb, ra, rc, rca, rcs] = await Promise.all([
        admin.from("payments").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        admin.from("bookings").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        admin.from("attendance").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        admin.from("crm_enrichments").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        admin.from("customer_attribution").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        admin.from("customer_sources").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
      ]);

      const totalRemaining = (rp.count ?? 0) + (rb.count ?? 0) + (ra.count ?? 0) + (rc.count ?? 0) + (rca.count ?? 0) + (rcs.count ?? 0);
      if (totalRemaining === 0) {
        await admin.from("stitching_conflicts").delete().or(
          `customer_a_id.eq.${customerId},customer_b_id.eq.${customerId}`
        );
        await admin.from("customers").delete().eq("id", customerId);
      }
    }
  }

  // 5. Mark import as reverted
  await admin
    .from("import_history")
    .update({
      status: "reverted",
      completed_at: new Date().toISOString(),
    })
    .eq("id", importId);
}

// ─── Reset All Data ──────────────────────────────────────

/**
 * Reset all demo data using a single-transaction RPC.
 * Deletes everything: attendance, bookings, payments, attribution, CRM enrichments,
 * customers (with cascading customer_sources), and import_history.
 */
export async function resetAllData(): Promise<{ deleted: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("reset_demo_data", {
    target_org_id: DEFAULT_ORG_ID,
  });

  if (error) throw new Error(`Reset failed: ${error.message}`);

  return { deleted: data ?? 0 };
}

// ─── Delete Import ──────────────────────────────────────

/**
 * Permanently delete an import and all its associated data.
 * Same cascade as revert, but also hard-deletes the import_history row.
 */
export async function deleteImport(importId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  // Verify the import exists
  const { data: imp, error: fetchError } = await admin
    .from("import_history")
    .select("id, status, org_id")
    .eq("id", importId)
    .single();

  if (fetchError || !imp) throw new Error("Import not found");
  if (imp.status === "processing") throw new Error("Import still processing");

  // 1. Find customers affected by this import
  const [paymentsRes, bookingsRes, attendanceRes, crmRes, attrRes, sourcesRes] = await Promise.all([
    admin.from("payments").select("customer_id").eq("import_id", importId),
    admin.from("bookings").select("customer_id").eq("import_id", importId),
    admin.from("attendance").select("customer_id").eq("import_id", importId),
    admin.from("crm_enrichments").select("customer_id").eq("import_id", importId),
    admin.from("customer_attribution").select("customer_id").eq("import_id", importId),
    admin.from("customer_sources").select("customer_id").eq("import_id", importId),
  ]);

  const affectedCustomerIds = new Set<string>();
  for (const row of [
    ...(paymentsRes.data ?? []),
    ...(bookingsRes.data ?? []),
    ...(attendanceRes.data ?? []),
    ...(crmRes.data ?? []),
    ...(attrRes.data ?? []),
    ...(sourcesRes.data ?? []),
  ]) {
    if (row.customer_id) affectedCustomerIds.add(row.customer_id);
  }

  // 2. Delete source data rows + source links
  await Promise.all([
    admin.from("payments").delete().eq("import_id", importId),
    admin.from("bookings").delete().eq("import_id", importId),
    admin.from("attendance").delete().eq("import_id", importId),
    admin.from("crm_enrichments").delete().eq("import_id", importId),
    admin.from("customer_attribution").delete().eq("import_id", importId),
    admin.from("customer_sources").delete().eq("import_id", importId),
  ]);

  // 3. Delete stitching conflicts linked to this import
  await admin.from("stitching_conflicts").delete().eq("import_id", importId);

  // 4. Orphan check — delete customers with no remaining data
  if (affectedCustomerIds.size > 0) {
    for (const customerId of affectedCustomerIds) {
      const [rp, rb, ra, rc, rca, rcs] = await Promise.all([
        admin.from("payments").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        admin.from("bookings").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        admin.from("attendance").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        admin.from("crm_enrichments").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        admin.from("customer_attribution").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
        admin.from("customer_sources").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
      ]);

      const total = (rp.count ?? 0) + (rb.count ?? 0) + (ra.count ?? 0) + (rc.count ?? 0) + (rca.count ?? 0) + (rcs.count ?? 0);
      if (total === 0) {
        await admin.from("stitching_conflicts").delete().or(
          `customer_a_id.eq.${customerId},customer_b_id.eq.${customerId}`
        );
        await admin.from("customers").delete().eq("id", customerId);
      }
    }
  }

  // 5. Hard-delete the import_history row
  await admin.from("import_history").delete().eq("id", importId);
}
