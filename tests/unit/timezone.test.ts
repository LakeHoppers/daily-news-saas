import { describe, expect, it } from "vitest";
import { getHourInTimezone, isValidTimezone } from "@/shared/timezone";

describe("isValidTimezone", () => {
  it("accepts real IANA timezone identifiers", () => {
    expect(isValidTimezone("Europe/Berlin")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
  });

  it("rejects garbage input", () => {
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("getHourInTimezone", () => {
  it("converts UTC to the local hour, no DST in January", () => {
    const noon = new Date("2026-01-15T12:00:00.000Z");
    expect(getHourInTimezone("Europe/Berlin", noon)).toBe(13); // CET = UTC+1
    expect(getHourInTimezone("America/New_York", noon)).toBe(7); // EST = UTC-5
  });

  it("wraps around midnight correctly", () => {
    const lateUtc = new Date("2026-01-15T23:30:00.000Z");
    expect(getHourInTimezone("Europe/Berlin", lateUtc)).toBe(0); // 00:30 CET next day
  });
});
