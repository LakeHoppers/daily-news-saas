import { describe, expect, it } from "vitest";
import {
  clampCategoriesForPlan,
  clampDigestHourForPlan,
  FREE_DIGEST_HOUR,
  FREE_MAX_CATEGORIES,
} from "@/modules/billing/domain/plan-limits";

describe("clampCategoriesForPlan", () => {
  it("truncates to the free limit for FREE users", () => {
    const result = clampCategoriesForPlan(["POLITICS", "ECONOMY", "BERLIN"], "FREE");
    expect(result).toHaveLength(FREE_MAX_CATEGORIES);
    expect(result).toEqual(["POLITICS"]);
  });

  it("leaves categories untouched for PRO users", () => {
    const categories = ["POLITICS", "ECONOMY", "BERLIN"] as const;
    expect(clampCategoriesForPlan([...categories], "PRO")).toEqual(categories);
  });
});

describe("clampDigestHourForPlan", () => {
  it("forces the fixed free hour regardless of what was requested", () => {
    expect(clampDigestHourForPlan(3, "FREE")).toBe(FREE_DIGEST_HOUR);
    expect(clampDigestHourForPlan(22, "FREE")).toBe(FREE_DIGEST_HOUR);
  });

  it("respects any requested hour for PRO users", () => {
    expect(clampDigestHourForPlan(3, "PRO")).toBe(3);
    expect(clampDigestHourForPlan(22, "PRO")).toBe(22);
  });
});
