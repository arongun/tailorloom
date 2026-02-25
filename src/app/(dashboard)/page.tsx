import {
  getInsightConfig,
  getDashboardMetrics,
  getRevenueTrend,
} from "@/lib/actions/dashboard";
import { DashboardClient } from "@/components/dashboard-client";

export default async function DashboardPage() {
  const config = await getInsightConfig();
  const [metrics, trend] = await Promise.all([
    getDashboardMetrics(config.churn_days, config.high_value_threshold),
    getRevenueTrend("12mo"),
  ]);

  return (
    <DashboardClient
      initialConfig={config}
      initialMetrics={metrics}
      initialTrend={trend}
    />
  );
}
