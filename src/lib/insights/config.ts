import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, DEFAULT_PROFILE_ID } from "./profiles";
import type { ResolvedConfig } from "./types";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Resolves the active config by merging profile defaults with DB overrides.
 *
 * Resolution order:
 * 1. profileParam (URL) > DB active_profile > "retreats" default
 * 2. Load profile defaults (all fields populated)
 * 3. Load DB insight_config row for org
 * 4. Merge: for each new column, if DB value is non-null, override profile default
 * 5. Legacy DB columns (churn_days, high_value_threshold) are ignored
 */
export async function resolveConfig(
  profileParam?: string | null
): Promise<ResolvedConfig> {
  const admin = createAdminClient();

  const { data: dbRow } = await admin
    .from("insight_config")
    .select(
      "active_profile, at_risk_days, dormant_days, lost_days, repeat_purchase_min, new_high_value_window_days, one_and_done_days"
    )
    .eq("org_id", DEFAULT_ORG_ID)
    .single();

  // Determine profile ID: URL param > DB active_profile > default
  const profileId =
    profileParam || dbRow?.active_profile || DEFAULT_PROFILE_ID;
  const profile = getProfile(profileId);

  // Start from profile defaults
  const resolved: ResolvedConfig = {
    ...profile,
    profile_id: profileId,
  };

  // Override with non-null DB values
  if (dbRow) {
    if (dbRow.at_risk_days != null) resolved.at_risk_days = dbRow.at_risk_days;
    if (dbRow.dormant_days != null) resolved.dormant_days = dbRow.dormant_days;
    if (dbRow.lost_days != null) resolved.lost_days = dbRow.lost_days;
    if (dbRow.repeat_purchase_min != null)
      resolved.repeat_purchase_min = dbRow.repeat_purchase_min;
    if (dbRow.new_high_value_window_days != null)
      resolved.new_high_value_window_days = dbRow.new_high_value_window_days;
    if (dbRow.one_and_done_days != null)
      resolved.one_and_done_days = dbRow.one_and_done_days;
  }

  // Derived field
  resolved.revenue_at_risk_min_ltv = resolved.tier_b_min;

  return resolved;
}
