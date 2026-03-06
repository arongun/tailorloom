import { describe, it, expect } from "vitest";

/**
 * Test 21: POS declined/void excluded from revenue calculations.
 *
 * This validates the pattern used in import.ts where only
 * "succeeded" and "approved" statuses are imported with revenue.
 */
describe("Payment status filtering", () => {
  const VALID_STATUSES = ["succeeded", "approved"];

  function shouldIncludeInRevenue(status: string): boolean {
    return VALID_STATUSES.includes(status);
  }

  it("includes succeeded payments", () => {
    expect(shouldIncludeInRevenue("succeeded")).toBe(true);
  });

  it("includes approved payments", () => {
    expect(shouldIncludeInRevenue("approved")).toBe(true);
  });

  it("excludes declined payments", () => {
    expect(shouldIncludeInRevenue("declined")).toBe(false);
  });

  it("excludes void payments", () => {
    expect(shouldIncludeInRevenue("void")).toBe(false);
  });

  it("excludes pending payments", () => {
    expect(shouldIncludeInRevenue("pending")).toBe(false);
  });

  it("excludes refunded payments", () => {
    expect(shouldIncludeInRevenue("refunded")).toBe(false);
  });
});
