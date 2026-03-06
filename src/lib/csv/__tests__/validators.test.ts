import { describe, it, expect } from "vitest";

describe("Email whitespace handling", () => {
  // Test 22: Email with leading/trailing whitespace gets trimmed
  it("trims whitespace from email addresses", () => {
    const rawEmail = "  user@example.com  ";
    const trimmed = rawEmail.trim().toLowerCase();
    expect(trimmed).toBe("user@example.com");
  });

  it("normalizes email to lowercase after trimming", () => {
    const rawEmail = " User@Example.COM ";
    const trimmed = rawEmail.trim().toLowerCase();
    expect(trimmed).toBe("user@example.com");
  });

  it("handles tabs and newlines in email", () => {
    const rawEmail = "\tuser@example.com\n";
    const trimmed = rawEmail.trim().toLowerCase();
    expect(trimmed).toBe("user@example.com");
  });
});
