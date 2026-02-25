import {
  getInsightConfig,
  getCustomersWithMetrics,
} from "@/lib/actions/dashboard";
import { CustomersClient } from "@/components/customers-client";

export default async function CustomersPage() {
  const config = await getInsightConfig();
  const customers = await getCustomersWithMetrics(
    config.churn_days,
    config.high_value_threshold
  );

  return <CustomersClient customers={customers} />;
}
