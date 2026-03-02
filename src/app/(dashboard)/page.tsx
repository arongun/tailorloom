import {
  getInsightCardResults,
  getRevenueTrend,
  getTopCustomers,
  getRevenueBySource,
} from "@/lib/actions/dashboard";
import { DashboardClient } from "@/components/dashboard-client";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const profile =
    typeof params.profile === "string" ? params.profile : undefined;
  const { config, insightResults } = await getInsightCardResults(profile);
  const [trend, topCustomers, revenueBySource] = await Promise.all([
    getRevenueTrend(),
    getTopCustomers(),
    getRevenueBySource(),
  ]);

  return (
    <DashboardClient
      config={config}
      insightResults={insightResults}
      initialTrend={trend}
      initialTopCustomers={topCustomers}
      initialRevenueBySource={revenueBySource}
    />
  );
}
