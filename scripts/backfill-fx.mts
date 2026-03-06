/**
 * One-time script: backfill amount_usd on existing payments.
 * Run with: npx tsx scripts/backfill-fx.mts
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_KEY);

function rateKey(currency: string, date: string): string {
  return `${currency.toUpperCase()}:${date}`;
}

async function fetchRate(currency: string, date: string): Promise<number | null> {
  const upper = currency.toUpperCase().trim();
  if (upper === "USD") return 1;

  const url = `https://api.frankfurter.dev/v1/${date}?base=${upper}&symbols=USD`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.rates?.USD ?? null;
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

async function main() {
  let updated = 0;
  let failed = 0;
  let missingRates = 0;
  const batchSize = 200;

  while (true) {
    const { data: batch } = await admin
      .from("payments")
      .select("id, amount, currency, payment_date")
      .is("amount_usd", null)
      .order("payment_date", { ascending: true })
      .limit(batchSize);

    if (!batch || batch.length === 0) break;

    // Collect unique (currency, date) pairs
    const uniquePairs = new Map<string, { currency: string; date: string }>();
    for (const p of batch) {
      const cur = (p.currency ?? "USD").toUpperCase().trim() || "USD";
      if (cur === "USD") continue;
      const date = p.payment_date?.split("T")[0] ?? new Date().toISOString().split("T")[0];
      const key = rateKey(cur, date);
      if (!uniquePairs.has(key)) uniquePairs.set(key, { currency: cur, date });
    }

    // Check cache first
    const pairEntries = Array.from(uniquePairs.values());
    const currencies = [...new Set(pairEntries.map((p) => p.currency))];
    const dates = [...new Set(pairEntries.map((p) => p.date))];

    const rateMap = new Map<string, number>();

    if (currencies.length > 0 && dates.length > 0) {
      const { data: cached } = await admin
        .from("fx_rates")
        .select("rate_date, base_currency, rate")
        .eq("quote_currency", "USD")
        .in("base_currency", currencies)
        .in("rate_date", dates);

      for (const row of cached ?? []) {
        rateMap.set(rateKey(row.base_currency, row.rate_date), Number(row.rate));
      }

      // Fetch missing rates from provider
      for (const [key, pair] of uniquePairs) {
        if (rateMap.has(key)) continue;
        const rate = await fetchRate(pair.currency, pair.date);
        if (rate != null) {
          rateMap.set(key, rate);
          // Cache in DB
          await admin.from("fx_rates").upsert({
            rate_date: pair.date,
            base_currency: pair.currency,
            quote_currency: "USD",
            rate,
            source: "frankfurter",
          }, { onConflict: "rate_date,base_currency,quote_currency" });
        }
      }
    }

    // Update each payment
    for (const p of batch) {
      const cur = (p.currency ?? "USD").toUpperCase().trim() || "USD";
      const dateStr = p.payment_date?.split("T")[0] ?? new Date().toISOString().split("T")[0];

      let amountUsd: number | null;
      let fxRate: number | null;
      let fxSource: string;

      if (cur === "USD") {
        amountUsd = Number(p.amount) || 0;
        fxRate = 1;
        fxSource = "identity";
      } else {
        const key = rateKey(cur, dateStr);
        const rate = rateMap.get(key);
        if (rate != null) {
          amountUsd = Math.round((Number(p.amount) || 0) * rate * 100) / 100;
          fxRate = rate;
          fxSource = "frankfurter";
        } else {
          amountUsd = null;
          fxRate = null;
          fxSource = "missing";
          missingRates++;
        }
      }

      const { error } = await admin
        .from("payments")
        .update({
          amount_usd: amountUsd,
          fx_rate: fxRate,
          fx_rate_date: dateStr,
          fx_source: fxSource,
        })
        .eq("id", p.id);

      if (error) {
        failed++;
        console.error(`Failed to update payment ${p.id}:`, error.message);
      } else {
        updated++;
      }
    }

    console.log(`Batch done: ${updated} updated, ${failed} failed, ${missingRates} missing rates so far`);
  }

  console.log(`\nBackfill complete: ${updated} updated, ${failed} failed, ${missingRates} missing rates`);
}

main().catch(console.error);
