import { getComputedCustomersForTable } from "@/lib/actions/dashboard";
import { CustomersClient } from "@/components/customers-client";

const VALID_SEGMENT = new Set(["revenue_at_risk", "repeat_customers", "channel", "win_back", "one_and_done", "new_high_value"]);
const VALID_RISK = new Set(["Healthy", "At Risk", "Dormant", "Lost"]);
const VALID_TIER = new Set(["Tier A", "Tier B", "Tier C"]);
const VALID_REPEAT = new Set(["repeat", "one_time"]);

/** Parse a param that may be a string or string[] into validated array */
function parseMulti(
  raw: string | string[] | undefined,
  validSet: Set<string>
): string[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.filter((v) => validSet.has(v));
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const profile =
    typeof params.profile === "string" ? params.profile : undefined;
  const rawQ = params.q;
  const initialSearch = typeof rawQ === "string" ? rawQ : Array.isArray(rawQ) ? (rawQ[0] ?? "") : "";
  const { customers, config } = await getComputedCustomersForTable(profile);

  // Validate channel values against actual customer data
  const validChannels = new Set<string>();
  for (const c of customers) {
    for (const ch of Object.keys(c.channel_revenue)) validChannels.add(ch);
  }

  return (
    <CustomersClient
      customers={customers}
      config={config}
      initialSearch={initialSearch}
      initialFilters={{
        segment: parseMulti(params.segment, VALID_SEGMENT),
        risk: parseMulti(params.risk, VALID_RISK),
        tier: parseMulti(params.tier, VALID_TIER),
        repeat: parseMulti(params.repeat, VALID_REPEAT),
        channel: parseMulti(params.channel, validChannels),
      }}
    />
  );
}
