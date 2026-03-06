"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { backfillPaymentsFx } from "@/lib/fx";

/**
 * One-time server action to backfill amount_usd on existing payments.
 * Safe to rerun — only processes rows with amount_usd IS NULL.
 */
export async function runFxBackfill() {
  const admin = createAdminClient();
  const result = await backfillPaymentsFx(admin);
  return result;
}
