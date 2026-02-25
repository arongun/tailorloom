import {
  getInsightConfig,
  getDashboardMetrics,
  getRevenueTrend,
  getTopCustomers,
  getRevenueBySource,
} from "@/lib/actions/dashboard";
import { DashboardClient } from "@/components/dashboard-client";

export default async function DashboardPage() {
  const config = await getInsightConfig();
  const [metrics, trend, topCustomers, revenueBySource] = await Promise.all([
    getDashboardMetrics(config.churn_days, config.high_value_threshold),
    getRevenueTrend(),
    getTopCustomers(),
    getRevenueBySource(),
  ]);

  return (
    <DashboardClient
      initialConfig={config}
      initialMetrics={metrics}
      initialTrend={trend}
      initialTopCustomers={topCustomers}
      initialRevenueBySource={revenueBySource}
    />
  );
}
