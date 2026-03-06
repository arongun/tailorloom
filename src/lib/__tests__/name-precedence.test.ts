import { describe, it, expect } from "vitest";
import { shouldUpdateName } from "../stitching/matcher";

describe("shouldUpdateName", () => {
  // Test 11: CRM name beats Stripe name
  it("CRM beats Stripe", () => {
    expect(shouldUpdateName("stripe", "crm")).toBe(true);
  });

  // Test 12: Stripe name beats POS name
  it("Stripe beats POS", () => {
    expect(shouldUpdateName("pos", "stripe")).toBe(true);
  });

  // Test 13: Attribution cannot overwrite CRM name
  it("Attribution cannot overwrite CRM", () => {
    expect(shouldUpdateName("crm", "attribution")).toBe(false);
  });

  // Test 14: Null name_source allows any source to claim
  it("null name_source allows any source to claim", () => {
    expect(shouldUpdateName(null, "attribution")).toBe(true);
    expect(shouldUpdateName(null, "manual")).toBe(true);
    expect(shouldUpdateName(null, "crm")).toBe(true);
  });

  // Additional edge cases
  it("same priority source can update (>=)", () => {
    expect(shouldUpdateName("calendly", "passline")).toBe(true); // both 50
    expect(shouldUpdateName("stripe", "stripe")).toBe(true); // same source
  });

  it("lower priority cannot overwrite higher", () => {
    expect(shouldUpdateName("stripe", "pos")).toBe(false); // 80 > 60
    expect(shouldUpdateName("pos", "manual")).toBe(false); // 60 > 20
    expect(shouldUpdateName("stripe", "attribution")).toBe(false); // 80 > 40
  });

  it("unknown source has priority 0", () => {
    expect(shouldUpdateName("unknown", "manual")).toBe(true); // 20 >= 0
    expect(shouldUpdateName("crm", "unknown")).toBe(false); // 0 < 100
  });
});
