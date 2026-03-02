import type { ProfileConfig } from "./types";

const PROFILES: Record<string, ProfileConfig> = {
  retreats: {
    id: "retreats",
    label: "Retreats",
    churn_days: 90,
    at_risk_days: 60,
    high_value_threshold: 1500,
    repeat_purchase_min: 2,
    dormant_days: 90,
    lost_days: 180,
    tier_b_min: 500,
    revenue_at_risk_min_ltv: 500,
  },
  membership: {
    id: "membership",
    label: "Membership",
    churn_days: 75,
    at_risk_days: 45,
    high_value_threshold: 1000,
    repeat_purchase_min: 3,
    dormant_days: 75,
    lost_days: 120,
    tier_b_min: 300,
    revenue_at_risk_min_ltv: 300,
  },
  services: {
    id: "services",
    label: "Services",
    churn_days: 150,
    at_risk_days: 90,
    high_value_threshold: 2000,
    repeat_purchase_min: 2,
    dormant_days: 150,
    lost_days: 270,
    tier_b_min: 750,
    revenue_at_risk_min_ltv: 750,
  },
};

export const DEFAULT_PROFILE_ID = "retreats";

export function getProfile(profileId: string): ProfileConfig {
  return PROFILES[profileId] ?? PROFILES[DEFAULT_PROFILE_ID];
}

export function getAllProfiles(): ProfileConfig[] {
  return Object.values(PROFILES);
}
