import { describe, it, expect } from "vitest";
import {
  CRM_SCHEMA,
  ATTRIBUTION_FIRSTTOUCH_SCHEMA,
  ATTRIBUTION_JOURNEYS_SCHEMA,
  SCHEMAS,
  detectAttributionSubtype,
  schemaKeyToSourceType,
} from "../schemas";

describe("CRM Schema", () => {
  // Test 15: CRM schema maps all 16 columns
  it("has all 16 fields for the CRM CSV", () => {
    const keys = CRM_SCHEMA.fields.map((f) => f.key);
    expect(keys).toEqual([
      "member_id",
      "full_name",
      "email",
      "phone",
      "last_visit_date",
      "classes_remaining",
      "membership_status",
      "referral_source",
      "notes",
      "country",
      "occupation",
      "skill_level",
      "member_type",
      "join_date",
      "preferred_currency",
      "preferred_time_slot",
    ]);
    expect(CRM_SCHEMA.fields).toHaveLength(16);
  });

  // Test 16: CRM identifier guardrail
  it("requires member_id as the id field", () => {
    expect(CRM_SCHEMA.idField).toBe("member_id");
    expect(CRM_SCHEMA.emailField).toBe("email");
    expect(CRM_SCHEMA.phoneField).toBe("phone");
  });
});

describe("Attribution Firsttouch Schema", () => {
  // Test 17: 19 fields
  it("has 19 fields matching the firsttouch CSV", () => {
    expect(ATTRIBUTION_FIRSTTOUCH_SCHEMA.fields).toHaveLength(19);
    const keys = ATTRIBUTION_FIRSTTOUCH_SCHEMA.fields.map((f) => f.key);
    expect(keys).toContain("conversion_id");
    expect(keys).toContain("n_touchpoints");
    expect(keys).toContain("journey_span_days");
    expect(keys).toContain("first_touch_channel");
    expect(keys).toContain("last_touch_channel");
    expect(keys).toContain("attributed_revenue_usd");
  });

  it("has correct source and metadata", () => {
    expect(ATTRIBUTION_FIRSTTOUCH_SCHEMA.source).toBe("attribution");
    expect(ATTRIBUTION_FIRSTTOUCH_SCHEMA.idField).toBe("conversion_id");
    expect(ATTRIBUTION_FIRSTTOUCH_SCHEMA.emailField).toBe("email");
    expect(ATTRIBUTION_FIRSTTOUCH_SCHEMA.nameField).toBe("full_name");
  });
});

describe("Attribution Journeys Schema", () => {
  // Test 18: 20 fields
  it("has 20 fields matching the journeys CSV", () => {
    expect(ATTRIBUTION_JOURNEYS_SCHEMA.fields).toHaveLength(20);
    const keys = ATTRIBUTION_JOURNEYS_SCHEMA.fields.map((f) => f.key);
    expect(keys).toContain("touch_id");
    expect(keys).toContain("touch_number");
    expect(keys).toContain("total_touches");
    expect(keys).toContain("touch_position");
    expect(keys).toContain("channel");
    expect(keys).toContain("first_touch_credit");
    expect(keys).toContain("first_touch_revenue");
  });

  it("has correct source and metadata", () => {
    expect(ATTRIBUTION_JOURNEYS_SCHEMA.source).toBe("attribution");
    expect(ATTRIBUTION_JOURNEYS_SCHEMA.idField).toBe("touch_id");
    expect(ATTRIBUTION_JOURNEYS_SCHEMA.emailField).toBe("email");
    expect(ATTRIBUTION_JOURNEYS_SCHEMA.nameField).toBe("full_name");
  });
});

describe("detectAttributionSubtype", () => {
  // Test 19: Two attribution schemas distinguishable by detection
  it("detects journeys sub-type from journeys-specific headers", () => {
    const journeyHeaders = [
      "touch_id", "conversion_id", "conversion_source", "email", "full_name",
      "product", "revenue_usd", "conversion_date", "touch_number",
      "total_touches", "touch_position", "channel", "utm_source",
      "utm_medium", "utm_campaign", "referrer", "touch_date",
      "days_before_conversion", "first_touch_credit", "first_touch_revenue",
    ];
    expect(detectAttributionSubtype(journeyHeaders)).toBe("attribution_journeys");
  });

  it("detects firsttouch sub-type from firsttouch-specific headers", () => {
    const firsttouchHeaders = [
      "conversion_id", "conversion_source", "email", "full_name", "product",
      "revenue_usd", "conversion_date", "n_touchpoints", "journey_span_days",
      "first_touch_channel", "first_touch_utm_source", "first_touch_utm_medium",
      "first_touch_campaign", "first_touch_referrer", "first_touch_date",
      "last_touch_channel", "last_touch_utm_source", "last_touch_date",
      "attributed_revenue_usd",
    ];
    expect(detectAttributionSubtype(firsttouchHeaders)).toBe("attribution_firsttouch");
  });

  it("handles case-insensitive headers", () => {
    expect(detectAttributionSubtype(["Touch_ID", "other"])).toBe("attribution_journeys");
  });
});

describe("schemaKeyToSourceType", () => {
  // Test 20: SchemaKey prevents accidental cast to SourceType
  it("maps attribution sub-types back to attribution", () => {
    expect(schemaKeyToSourceType("attribution_firsttouch")).toBe("attribution");
    expect(schemaKeyToSourceType("attribution_journeys")).toBe("attribution");
    expect(schemaKeyToSourceType("attribution")).toBe("attribution");
  });

  it("passes through non-attribution source types", () => {
    expect(schemaKeyToSourceType("stripe")).toBe("stripe");
    expect(schemaKeyToSourceType("crm")).toBe("crm");
    expect(schemaKeyToSourceType("pos")).toBe("pos");
  });
});

describe("SCHEMAS registry", () => {
  it("includes all expected schema keys", () => {
    const keys = Object.keys(SCHEMAS);
    expect(keys).toContain("stripe");
    expect(keys).toContain("crm");
    expect(keys).toContain("attribution");
    expect(keys).toContain("attribution_firsttouch");
    expect(keys).toContain("attribution_journeys");
  });

  it("attribution and attribution_firsttouch point to the same schema", () => {
    expect(SCHEMAS["attribution"]).toBe(SCHEMAS["attribution_firsttouch"]);
  });
});
