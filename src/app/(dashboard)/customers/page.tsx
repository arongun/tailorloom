import { getComputedCustomersForTable } from "@/lib/actions/dashboard";
import { CustomersClient, type RiskFilterValue, type TierFilterValue, type RepeatFilterValue } from "@/components/customers-client";

const VALID_RISK = new Set(["all", "Healthy", "At Risk", "Dormant", "Lost"]);
const VALID_TIER = new Set(["all", "Tier A", "Tier B", "Tier C"]);
const VALID_REPEAT = new Set(["all", "repeat", "one_time"]);

function validParam(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const profile = validParam(params.profile);
  const insight = validParam(params.insight);
  const value = validParam(params.value);
  const { customers, config } = await getComputedCustomersForTable(profile);

  // Validate manual filter params — fall back to "all" for unrecognized values
  const riskRaw = validParam(params.risk) ?? "all";
  const tierRaw = validParam(params.tier) ?? "all";
  const repeatRaw = validParam(params.repeat) ?? "all";
  const channelRaw = validParam(params.channel) ?? "all";

  // Validate channel against actual customer data
  const validChannels = new Set<string>();
  for (const c of customers) {
    for (const ch of Object.keys(c.channel_revenue)) validChannels.add(ch);
  }

  return (
    <CustomersClient
      customers={customers}
      config={config}
      activeInsightFilter={insight ? { type: insight, value } : null}
      initialFilters={{
        risk: (VALID_RISK.has(riskRaw) ? riskRaw : "all") as RiskFilterValue,
        tier: (VALID_TIER.has(tierRaw) ? tierRaw : "all") as TierFilterValue,
        repeat: (VALID_REPEAT.has(repeatRaw) ? repeatRaw : "all") as RepeatFilterValue,
        channel: channelRaw === "all" || validChannels.has(channelRaw) ? channelRaw : "all",
      }}
    />
  );
}
