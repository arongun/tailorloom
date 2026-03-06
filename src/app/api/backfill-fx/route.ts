import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { backfillPaymentsFx } from "@/lib/fx";

export async function POST() {
  const admin = createAdminClient();
  const result = await backfillPaymentsFx(admin);
  return NextResponse.json(result);
}
