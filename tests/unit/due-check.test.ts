import { describe, expect, it } from "vitest";
import { isDueNow } from "@/modules/notification/domain/due-check";

describe("isDueNow", () => {
  it("is due when the local hour matches digestHour", () => {
    const noon = new Date("2026-01-15T12:00:00.000Z");
    expect(isDueNow("Europe/Berlin", 13, noon)).toBe(true); // 12:00 UTC = 13:00 CET
  });

  it("is not due before the preferred local hour", () => {
    const noon = new Date("2026-01-15T12:00:00.000Z");
    expect(isDueNow("Europe/Berlin", 14, noon)).toBe(false);
  });

  it("different timezones can disagree on whether now is due", () => {
    const noon = new Date("2026-01-15T12:00:00.000Z");
    expect(isDueNow("Europe/Berlin", 13, noon)).toBe(true);
    expect(isDueNow("America/New_York", 13, noon)).toBe(false); // it's 07:00 there
  });
});

it("catches up when GitHub Actions runs minutes or hours late", () => {
  expect(isDueNow("Europe/Berlin", 9, new Date("2026-01-15T08:17:00Z"))).toBe(true);
  expect(isDueNow("Europe/Berlin", 9, new Date("2026-01-15T12:17:00Z"))).toBe(true);
});
it("resets eligibility at local midnight", () => {
  expect(isDueNow("Europe/Berlin", 9, new Date("2026-01-15T23:17:00Z"))).toBe(false);
});
it("catches a skipped DST hour after the clock advances", () => {
  expect(isDueNow("Europe/Berlin", 2, new Date("2026-03-29T01:17:00Z"))).toBe(true);
});
