import type { SupabaseClient } from "@supabase/supabase-js";

// ── Provider interface ──────────────────────────────────────

export interface FxProvider {
  fetchRate(currency: string, date: string): Promise<number | null>;
  name: string;
}

// ── Frankfurter provider ────────────────────────────────────

export class FrankfurterProvider implements FxProvider {
  name = "frankfurter";

  async fetchRate(currency: string, date: string): Promise<number | null> {
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
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    return null;
  }
}

// ── Core functions ──────────────────────────────────────────

const defaultProvider = new FrankfurterProvider();

function rateKey(currency: string, date: string): string {
  return `${currency.toUpperCase()}:${date}`;
}

/**
 * Batch-resolve FX rates for a set of (currency, date) pairs.
 * 1. Dedup, filter out USD
 * 2. Query fx_rates table for all pairs (single query)
 * 3. For cache misses, call provider
 * 4. Cache new rates in fx_rates
 * 5. If provider fails: fallback to most recent prior cached rate
 * 6. If no cache at all: return null (caller decides policy)
 */
export async function resolveRates(
  admin: SupabaseClient,
  pairs: { currency: string; date: string }[],
  provider: FxProvider = defaultProvider
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // Dedup and filter out USD
  const uniquePairs = new Map<string, { currency: string; date: string }>();
  for (const p of pairs) {
    const cur = (p.currency ?? "USD").toUpperCase().trim() || "USD";
    if (cur === "USD") continue;
    const key = rateKey(cur, p.date);
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, { currency: cur, date: p.date });
    }
  }

  if (uniquePairs.size === 0) return result;

  // Query cache for all pairs at once
  const pairEntries = Array.from(uniquePairs.values());
  const currencies = [...new Set(pairEntries.map((p) => p.currency))];
  const dates = [...new Set(pairEntries.map((p) => p.date))];

  const { data: cached } = await admin
    .from("fx_rates")
    .select("rate_date, base_currency, rate")
    .eq("quote_currency", "USD")
    .in("base_currency", currencies)
    .in("rate_date", dates);

  // Index cached rates
  const cachedMap = new Map<string, number>();
  for (const row of cached ?? []) {
    cachedMap.set(rateKey(row.base_currency, row.rate_date), Number(row.rate));
  }

  // Resolve misses
  const toInsert: {
    rate_date: string;
    base_currency: string;
    quote_currency: string;
    rate: number;
    source: string;
  }[] = [];

  for (const [key, pair] of uniquePairs) {
    const cachedRate = cachedMap.get(key);
    if (cachedRate != null) {
      result.set(key, cachedRate);
      continue;
    }

    // Try provider
    const rate = await provider.fetchRate(pair.currency, pair.date);
    if (rate != null) {
      result.set(key, rate);
      toInsert.push({
        rate_date: pair.date,
        base_currency: pair.currency,
        quote_currency: "USD",
        rate,
        source: provider.name,
      });
      continue;
    }

    // Fallback: most recent prior cached rate
    const { data: fallback } = await admin
      .from("fx_rates")
      .select("rate")
      .eq("base_currency", pair.currency)
      .eq("quote_currency", "USD")
      .lte("rate_date", pair.date)
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallback) {
      result.set(key, Number(fallback.rate));
    }
    // else: no rate available → key stays absent from result map
  }

  // Cache new rates (upsert to handle races)
  if (toInsert.length > 0) {
    await admin
      .from("fx_rates")
      .upsert(toInsert, { onConflict: "rate_date,base_currency,quote_currency" });
  }

  return result;
}

/**
 * Sync conversion using pre-resolved rate map.
 * - USD or null/empty → passthrough
 * - Lookup rate → compute
 * - Missing rate → amountUsd: null
 */
export function toUSD(
  amount: number,
  currency: string | null | undefined,
  date: string,
  rates: Map<string, number>
): { amountUsd: number | null; rate: number | null; rateDate: string; source: string } {
  const cur = (currency ?? "USD").toUpperCase().trim() || "USD";

  if (cur === "USD") {
    return { amountUsd: amount, rate: 1, rateDate: date, source: "identity" };
  }

  const key = rateKey(cur, date);
  const rate = rates.get(key);

  if (rate == null) {
    return { amountUsd: null, rate: null, rateDate: date, source: "missing" };
  }

  return {
    amountUsd: Math.round(amount * rate * 100) / 100,
    rate,
    rateDate: date,
    source: "frankfurter",
  };
}

/**
 * Backfill: convert all existing payments that have amount_usd = NULL.
 * Idempotent, chunked, safe to rerun.
 */
export async function backfillPaymentsFx(
  admin: SupabaseClient,
  batchSize: number = 200,
  provider: FxProvider = defaultProvider
): Promise<{ updated: number; failed: number; missingRates: number }> {
  let updated = 0;
  let failed = 0;
  let missingRates = 0;

  while (true) {
    const { data: batch } = await admin
      .from("payments")
      .select("id, amount, currency, payment_date")
      .is("amount_usd", null)
      .order("payment_date", { ascending: true })
      .limit(batchSize);

    if (!batch || batch.length === 0) break;

    // Collect unique (currency, date) pairs
    const pairs = batch.map((p) => ({
      currency: (p.currency ?? "USD").toUpperCase().trim() || "USD",
      date: p.payment_date?.split("T")[0] ?? new Date().toISOString().split("T")[0],
    }));

    const rates = await resolveRates(admin, pairs, provider);

    for (const p of batch) {
      const cur = (p.currency ?? "USD").toUpperCase().trim() || "USD";
      const dateStr = p.payment_date?.split("T")[0] ?? new Date().toISOString().split("T")[0];
      const fx = toUSD(Number(p.amount) || 0, cur, dateStr, rates);

      if (fx.amountUsd == null) {
        missingRates++;
        // Still update to mark as attempted with source='missing'
        const { error } = await admin
          .from("payments")
          .update({
            fx_rate: null,
            fx_rate_date: dateStr,
            fx_source: "missing",
          })
          .eq("id", p.id);
        if (error) failed++;
        continue;
      }

      const { error } = await admin
        .from("payments")
        .update({
          amount_usd: fx.amountUsd,
          fx_rate: fx.rate,
          fx_rate_date: dateStr,
          fx_source: fx.source,
        })
        .eq("id", p.id);

      if (error) failed++;
      else updated++;
    }
  }

  return { updated, failed, missingRates };
}
