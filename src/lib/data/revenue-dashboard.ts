export type ServiceCategory = "Consulting" | "Implementation" | "Training" | "Support" | "Custom Development";

export interface Purchase {
  id: string;
  customerId: string;
  date: string;
  amount: number;
  category: ServiceCategory;
  description: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  company: string;
  joinDate: string;
}

export interface CustomerWithMetrics extends Customer {
  totalRevenue: number;
  purchaseCount: number;
  lastPurchaseDate: string;
  status: "Active" | "At Risk" | "Churned";
  segment: "High Value" | "Regular" | "Low Value";
  purchases: Purchase[];
  revenueChange: number;
}

// Deterministic seeded random
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(42);

const firstNames = [
  "Sarah", "Michael", "Jennifer", "David", "Emily", "James", "Amanda", "Robert",
  "Lisa", "William", "Jessica", "Thomas", "Ashley", "Daniel", "Rachel", "Christopher",
  "Nicole", "Matthew", "Stephanie", "Andrew", "Lauren", "Ryan", "Megan", "Kevin",
  "Olivia", "Brian", "Hannah", "Jason", "Samantha", "Mark", "Victoria", "Eric",
  "Elizabeth", "Steven", "Katherine", "Patrick", "Natalie", "Tyler", "Rebecca", "Sean",
  "Michelle", "Carlos", "Diana", "Raj", "Priya", "Wei", "Yuki", "Ahmed", "Sofia", "Marcus"
];

const lastNames = [
  "Chen", "Patel", "Johnson", "Williams", "Rodriguez", "Kim", "Nakamura", "Anderson",
  "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Lewis", "Lee", "Walker",
  "Hall", "Allen", "Young", "Hernandez", "King", "Wright", "Lopez", "Hill",
  "Scott", "Green", "Adams", "Baker", "Nelson", "Carter", "Mitchell", "Perez",
  "Roberts", "Turner", "Phillips", "Campbell", "Parker", "Evans", "Edwards", "Collins",
  "Stewart", "Sanchez", "Morris", "Rogers", "Reed", "Cook", "Morgan", "Bell", "Murphy", "Bailey"
];

const companies = [
  "Apex Digital", "BrightPath Solutions", "Catalyst Group", "DataVista Inc", "EchoStar Technologies",
  "FreshWave Media", "GreenLeaf Analytics", "Horizon Partners", "InnoTech Labs", "JetStream Corp",
  "Keystone Ventures", "LightSpeed Systems", "Meridian Consulting", "NexGen Solutions", "OmniCore",
  "PrimeScale", "Quantum Edge", "RiverRock Capital", "SilverLine Partners", "TrueNorth Digital",
  "UrbanGrid", "VelocityIO", "WestBridge", "XPoint Analytics", "Zenith Corp",
  "AlphaWorks", "BlueSky Labs", "CloudPeak", "DeltaForce Tech", "EliteOps",
  "FirstMile", "GlobalSync", "HighTide", "IronClad Systems", "JadePoint",
  "KiloVolt", "LunarEdge", "MetaPulse", "NovaBridge", "OrionTech",
  "PeakFlow", "QualityFirst", "RedShift", "SummitAI", "TidalWave",
  "UltraVox", "VistaPoint", "WaveCrest", "Xcelerate", "Yorktown Digital"
];

const serviceDescriptions: Record<ServiceCategory, string[]> = {
  "Consulting": [
    "Strategic planning workshop", "Process optimization review", "Digital transformation assessment",
    "Revenue growth strategy session", "Market analysis deep-dive", "Operational efficiency audit"
  ],
  "Implementation": [
    "CRM system deployment", "Analytics platform setup", "Workflow automation build",
    "Data pipeline integration", "API gateway configuration", "Dashboard implementation"
  ],
  "Training": [
    "Team onboarding program", "Advanced analytics workshop", "Leadership development series",
    "Platform certification course", "Best practices bootcamp", "Technical skills seminar"
  ],
  "Support": [
    "Priority support plan", "Monthly maintenance retainer", "Incident response package",
    "System health monitoring", "Performance tuning service", "Quarterly review & optimization"
  ],
  "Custom Development": [
    "Custom reporting module", "Bespoke integration build", "White-label portal development",
    "Custom workflow engine", "Proprietary algorithm development", "Tailored dashboard creation"
  ]
};

function getMonthDate(monthsAgo: number, day?: number): string {
  const d = new Date(2026, 1, 15); // Feb 15, 2026
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(day || Math.floor(rand() * 28) + 1);
  return d.toISOString().split("T")[0];
}

// Create 50 customers
export const customers: Customer[] = Array.from({ length: 50 }, (_, i) => ({
  id: `cust-${String(i + 1).padStart(3, "0")}`,
  name: `${firstNames[i]} ${lastNames[i]}`,
  email: `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase()}@${companies[i].toLowerCase().replace(/[^a-z]/g, "")}.com`,
  company: companies[i],
  joinDate: getMonthDate(Math.floor(rand() * 18) + 6),
}));

// Customer archetypes for storytelling
type Archetype = "whale" | "growing" | "steady" | "declining" | "churned" | "new" | "sporadic";

function getArchetype(index: number): Archetype {
  if (index < 5) return "whale";
  if (index < 12) return "growing";
  if (index < 22) return "steady";
  if (index < 30) return "declining";
  if (index < 38) return "churned";
  if (index < 44) return "new";
  return "sporadic";
}

function generatePurchasesForCustomer(index: number): Purchase[] {
  const archetype = getArchetype(index);
  const custId = `cust-${String(index + 1).padStart(3, "0")}`;
  const categories: ServiceCategory[] = ["Consulting", "Implementation", "Training", "Support", "Custom Development"];
  const purchases: Purchase[] = [];

  const addPurchase = (monthsAgo: number, amountMin: number, amountMax: number, cat?: ServiceCategory) => {
    const category = cat || categories[Math.floor(rand() * categories.length)];
    const descs = serviceDescriptions[category];
    const amount = Math.round((amountMin + rand() * (amountMax - amountMin)) * 100) / 100;
    purchases.push({
      id: `pur-${String(purchases.length + 1).padStart(4, "0")}-${custId}`,
      customerId: custId,
      date: getMonthDate(monthsAgo),
      amount,
      category,
      description: descs[Math.floor(rand() * descs.length)],
    });
  };

  switch (archetype) {
    case "whale":
      for (let m = 0; m < 12; m++) {
        if (rand() > 0.25) addPurchase(m, 2000, 5000);
        if (rand() > 0.7) addPurchase(m, 1000, 3000);
      }
      break;
    case "growing":
      for (let m = 11; m >= 0; m--) {
        if (rand() > 0.4) {
          const baseAmount = 500 + (11 - m) * 200;
          addPurchase(m, baseAmount, baseAmount + 800);
        }
      }
      break;
    case "steady":
      for (let m = 0; m < 12; m += (rand() > 0.5 ? 1 : 2)) {
        addPurchase(m, 400, 1500);
      }
      break;
    case "declining":
      for (let m = 6; m < 12; m++) {
        if (rand() > 0.3) addPurchase(m, 800, 2500);
      }
      if (rand() > 0.5) addPurchase(3 + Math.floor(rand() * 3), 200, 600);
      break;
    case "churned": {
      const lastActive = 4 + Math.floor(rand() * 5);
      for (let m = lastActive; m < 12; m++) {
        if (rand() > 0.4) addPurchase(m, 300, 1800);
      }
      break;
    }
    case "new":
      addPurchase(0, 500, 2000);
      if (rand() > 0.3) addPurchase(1, 300, 1500);
      if (rand() > 0.6) addPurchase(0, 200, 800);
      break;
    case "sporadic":
      for (let m = 0; m < 12; m++) {
        if (rand() > 0.7) addPurchase(m, 50, 1200);
      }
      if (purchases.length === 0) addPurchase(Math.floor(rand() * 6), 100, 500);
      break;
  }

  return purchases;
}

// Generate all purchases
export const allPurchases: Purchase[] = [];
const customerPurchaseMap: Map<string, Purchase[]> = new Map();

for (let i = 0; i < 50; i++) {
  const custPurchases = generatePurchasesForCustomer(i);
  customerPurchaseMap.set(customers[i].id, custPurchases);
  allPurchases.push(...custPurchases);
}

allPurchases.forEach((p, idx) => {
  p.id = `pur-${String(idx + 1).padStart(4, "0")}`;
});

// Compute customer metrics
export function computeCustomerMetrics(
  churnThresholdDays: number = 90,
  highValueThreshold: number = 5000
): CustomerWithMetrics[] {
  const today = new Date(2026, 1, 15);

  return customers.map((customer) => {
    const purchases = customerPurchaseMap.get(customer.id) || [];
    const totalRevenue = purchases.reduce((sum, p) => sum + p.amount, 0);
    const purchaseCount = purchases.length;

    const sortedPurchases = [...purchases].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const lastPurchaseDate = sortedPurchases[0]?.date || customer.joinDate;

    const daysSinceLastPurchase = Math.floor(
      (today.getTime() - new Date(lastPurchaseDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    let status: "Active" | "At Risk" | "Churned";
    if (daysSinceLastPurchase > churnThresholdDays * 1.5) {
      status = "Churned";
    } else if (daysSinceLastPurchase > churnThresholdDays) {
      status = "At Risk";
    } else {
      status = "Active";
    }

    let segment: "High Value" | "Regular" | "Low Value";
    if (totalRevenue >= highValueThreshold) {
      segment = "High Value";
    } else if (totalRevenue >= highValueThreshold * 0.3) {
      segment = "Regular";
    } else {
      segment = "Low Value";
    }

    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const recentRevenue = purchases
      .filter((p) => new Date(p.date) >= sixMonthsAgo)
      .reduce((sum, p) => sum + p.amount, 0);
    const priorRevenue = purchases
      .filter((p) => new Date(p.date) >= twelveMonthsAgo && new Date(p.date) < sixMonthsAgo)
      .reduce((sum, p) => sum + p.amount, 0);

    const revenueChange = priorRevenue > 0
      ? ((recentRevenue - priorRevenue) / priorRevenue) * 100
      : recentRevenue > 0 ? 100 : 0;

    return {
      ...customer,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      purchaseCount,
      lastPurchaseDate,
      status,
      segment,
      purchases: sortedPurchases,
      revenueChange: Math.round(revenueChange * 10) / 10,
    };
  });
}

// Dashboard metrics
export function computeDashboardMetrics(
  churnThresholdDays: number = 90,
  highValueThreshold: number = 5000
) {
  const customersWithMetrics = computeCustomerMetrics(churnThresholdDays, highValueThreshold);
  const today = new Date(2026, 1, 15);

  const totalRevenue = customersWithMetrics.reduce((sum, c) => sum + c.totalRevenue, 0);
  const activeCustomers = customersWithMetrics.filter((c) => c.status === "Active").length;
  const atRiskCustomers = customersWithMetrics.filter((c) => c.status === "At Risk").length;
  const avgRevenuePerCustomer = totalRevenue / customersWithMetrics.length;

  const avgLifespanMonths = customersWithMetrics.reduce((sum, c) => {
    const months = (today.getTime() - new Date(c.joinDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
    return sum + months;
  }, 0) / customersWithMetrics.length;
  const monthlyAvg = totalRevenue / customersWithMetrics.length / Math.max(avgLifespanMonths, 1);
  const clv = monthlyAvg * 24;

  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const twelveMonthsAgo = new Date(today);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const recentTotal = allPurchases
    .filter((p) => new Date(p.date) >= sixMonthsAgo)
    .reduce((sum, p) => sum + p.amount, 0);
  const priorTotal = allPurchases
    .filter((p) => new Date(p.date) >= twelveMonthsAgo && new Date(p.date) < sixMonthsAgo)
    .reduce((sum, p) => sum + p.amount, 0);
  const revenueChange = priorTotal > 0 ? ((recentTotal - priorTotal) / priorTotal) * 100 : 0;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    activeCustomers,
    atRiskCustomers,
    churnedCustomers: customersWithMetrics.filter((c) => c.status === "Churned").length,
    avgRevenuePerCustomer: Math.round(avgRevenuePerCustomer * 100) / 100,
    clv: Math.round(clv * 100) / 100,
    revenueChange: Math.round(revenueChange * 10) / 10,
    customers: customersWithMetrics,
  };
}

// Monthly revenue trend
export function getMonthlyRevenueTrend(): { month: string; revenue: number; purchases: number }[] {
  const today = new Date(2026, 1, 15);
  const months: { month: string; revenue: number; purchases: number }[] = [];

  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    const monthLabel = monthStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    const monthPurchases = allPurchases.filter((p) => {
      const d = new Date(p.date);
      return d >= monthStart && d <= monthEnd;
    });

    months.push({
      month: monthLabel,
      revenue: Math.round(monthPurchases.reduce((sum, p) => sum + p.amount, 0) * 100) / 100,
      purchases: monthPurchases.length,
    });
  }

  return months;
}
