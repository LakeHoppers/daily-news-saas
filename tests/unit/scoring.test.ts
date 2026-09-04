import { describe, expect, it } from "vitest";
import { computeImportanceScore } from "@/modules/ranking/domain/scoring";

describe("computeImportanceScore", () => {
  const now = new Date("2026-01-02T12:00:00Z");

  it("rewards more corroborating sources", () => {
    const oneSource = computeImportanceScore({
      distinctSourceCount: 1,
      avgTrustScore: 80,
      mostRecentPublishedAt: now,
      now,
    });
    const threeSources = computeImportanceScore({
      distinctSourceCount: 3,
      avgTrustScore: 80,
      mostRecentPublishedAt: now,
      now,
    });
    expect(threeSources).toBeGreaterThan(oneSource);
  });

  it("rewards higher trust scores", () => {
    const lowTrust = computeImportanceScore({
      distinctSourceCount: 1,
      avgTrustScore: 50,
      mostRecentPublishedAt: now,
      now,
    });
    const highTrust = computeImportanceScore({
      distinctSourceCount: 1,
      avgTrustScore: 95,
      mostRecentPublishedAt: now,
      now,
    });
    expect(highTrust).toBeGreaterThan(lowTrust);
  });

  it("rewards more recent stories over older ones", () => {
    const fresh = computeImportanceScore({
      distinctSourceCount: 1,
      avgTrustScore: 80,
      mostRecentPublishedAt: now,
      now,
    });
    const stale = computeImportanceScore({
      distinctSourceCount: 1,
      avgTrustScore: 80,
      mostRecentPublishedAt: new Date("2026-01-01T00:00:00Z"),
      now,
    });
    expect(fresh).toBeGreaterThan(stale);
  });

  it("treats an unknown publish time as old rather than crashing", () => {
    expect(() =>
      computeImportanceScore({
        distinctSourceCount: 1,
        avgTrustScore: 80,
        mostRecentPublishedAt: null,
        now,
      }),
    ).not.toThrow();
  });
});
