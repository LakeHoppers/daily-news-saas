import { describe, expect, it } from "vitest";
import { isDueNow } from "@/modules/notification/domain/due-check";

describe("isDueNow", () => {
  it("is due when the local hour matches digestHour", () => {
    const noon = new Date("2026-01-15T12:00:00.000Z");
    expect(isDueNow("Europe/Berlin", 13, noon)).toBe(true); // 12:00 UTC = 13:00 CET
  });

  it("is not due when the local hour doesn't match", () => {
    const noon = new Date("2026-01-15T12:00:00.000Z");
    expect(isDueNow("Europe/Berlin", 7, noon)).toBe(false);
  });

  it("different timezones can disagree on whether now is due", () => {
    const noon = new Date("2026-01-15T12:00:00.000Z");
    expect(isDueNow("Europe/Berlin", 13, noon)).toBe(true);
    expect(isDueNow("America/New_York", 13, noon)).toBe(false); // it's 07:00 there
  });
});
