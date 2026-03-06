import { describe, it, expect } from "vitest";
import { toUSD } from "../fx";

describe("toUSD", () => {
  // Test 1: USD passthrough
  it("returns amount as-is for USD with rate 1.0", () => {
    const rates = new Map<string, number>();
    const result = toUSD(100, "USD", "2025-01-15", rates);
    expect(result.amountUsd).toBe(100);
    expect(result.rate).toBe(1);
    expect(result.source).toBe("identity");
  });

  // Test 2: MXN conversion
  it("converts MXN to USD using cached rate", () => {
    const rates = new Map<string, number>();
    rates.set("MXN:2025-01-15", 0.04884);
    const result = toUSD(1000, "MXN", "2025-01-15", rates);
    expect(result.amountUsd).toBe(48.84);
    expect(result.rate).toBe(0.04884);
    expect(result.source).toBe("frankfurter");
  });

  // Test 3: Null/undefined/empty currency defaults to USD
  it("treats null currency as USD", () => {
    const rates = new Map<string, number>();
    const result = toUSD(50, null, "2025-01-15", rates);
    expect(result.amountUsd).toBe(50);
    expect(result.rate).toBe(1);
    expect(result.source).toBe("identity");
  });

  it("treats undefined currency as USD", () => {
    const rates = new Map<string, number>();
    const result = toUSD(50, undefined, "2025-01-15", rates);
    expect(result.amountUsd).toBe(50);
    expect(result.rate).toBe(1);
  });

  it("treats empty string currency as USD", () => {
    const rates = new Map<string, number>();
    const result = toUSD(50, "", "2025-01-15", rates);
    expect(result.amountUsd).toBe(50);
    expect(result.rate).toBe(1);
  });

  // Test 4: Unknown currency with no cached rate returns null
  it("returns null amountUsd when rate is missing", () => {
    const rates = new Map<string, number>();
    const result = toUSD(1000, "GBP", "2025-01-15", rates);
    expect(result.amountUsd).toBeNull();
    expect(result.rate).toBeNull();
    expect(result.source).toBe("missing");
  });

  // Test 5: missingFxCount tracking pattern
  it("tracks missing FX count when filtering null amount_usd", () => {
    const rates = new Map<string, number>();
    rates.set("MXN:2025-01-15", 0.04884);

    const payments = [
      { amount: 100, currency: "USD", date: "2025-01-15" },
      { amount: 1000, currency: "MXN", date: "2025-01-15" },
      { amount: 500, currency: "GBP", date: "2025-01-15" }, // no rate
    ];

    const converted = payments.map((p) => toUSD(p.amount, p.currency, p.date, rates));
    const withFx = converted.filter((c) => c.amountUsd != null);
    const missingFxCount = converted.length - withFx.length;

    expect(withFx).toHaveLength(2);
    expect(missingFxCount).toBe(1);
  });

  // Test 6: Mixed USD/MXN totals across multiple dates
  it("produces correct normalized total across mixed currencies and dates", () => {
    const rates = new Map<string, number>();
    rates.set("MXN:2025-01-10", 0.05);
    rates.set("MXN:2025-01-20", 0.048);

    const payments = [
      { amount: 200, currency: "USD", date: "2025-01-10" },
      { amount: 2000, currency: "MXN", date: "2025-01-10" }, // 2000 * 0.05 = 100
      { amount: 1000, currency: "MXN", date: "2025-01-20" }, // 1000 * 0.048 = 48
    ];

    const total = payments.reduce((sum, p) => {
      const result = toUSD(p.amount, p.currency, p.date, rates);
      return sum + (result.amountUsd ?? 0);
    }, 0);

    expect(total).toBe(348); // 200 + 100 + 48
  });

  // Test 7: Currency is case-insensitive and trimmed
  it("handles case-insensitive and whitespace currency codes", () => {
    const rates = new Map<string, number>();
    rates.set("MXN:2025-01-15", 0.05);

    const result = toUSD(100, " mxn ", "2025-01-15", rates);
    expect(result.amountUsd).toBe(5);
    expect(result.rate).toBe(0.05);
  });

  // Test 8: Rounding to 2 decimal places
  it("rounds converted amount to 2 decimal places", () => {
    const rates = new Map<string, number>();
    rates.set("MXN:2025-01-15", 0.04884);

    // 999 * 0.04884 = 48.79116 → 48.79
    const result = toUSD(999, "MXN", "2025-01-15", rates);
    expect(result.amountUsd).toBe(48.79);
  });

  // Test 9: Attribution revenue_usd bypass pattern (already USD, no reconversion)
  it("passes through attribution revenue already in USD", () => {
    const rates = new Map<string, number>();
    // Attribution data arrives as revenue_usd — treat as USD passthrough
    const result = toUSD(149.99, "USD", "2025-02-01", rates);
    expect(result.amountUsd).toBe(149.99);
    expect(result.rate).toBe(1);
  });

  // Test 10: Zero amount
  it("handles zero amount correctly", () => {
    const rates = new Map<string, number>();
    rates.set("MXN:2025-01-15", 0.05);

    const result = toUSD(0, "MXN", "2025-01-15", rates);
    expect(result.amountUsd).toBe(0);
    expect(result.rate).toBe(0.05);
  });
});
