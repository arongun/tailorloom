"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  SourceType,
  ImportHistory,
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

  // 5. Fill in missing fields on A from B
  const { data: customerA } = await admin
    .from("customers")
    .select("full_name, email, phone")
    .eq("id", keepId)
    .single();

  const { data: customerB } = await admin
    .from("customers")
    .select("full_name, email, phone")
    .eq("id", removeId)
    .single();

  if (customerA && customerB) {
    const updates: Record<string, string> = {};
    if (!customerA.full_name && customerB.full_name) updates.full_name = customerB.full_name;
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
