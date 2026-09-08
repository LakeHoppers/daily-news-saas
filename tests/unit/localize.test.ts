import { describe, expect, it } from "vitest";
import { pickLocalizedText } from "@/modules/digest/domain/localize";

describe("pickLocalizedText", () => {
  it("returns Turkish for locale tr regardless of an English value", () => {
    expect(pickLocalizedText("tr", "Merhaba", "Hello")).toBe("Merhaba");
  });

  it("returns English for locale en when a translation exists", () => {
    expect(pickLocalizedText("en", "Merhaba", "Hello")).toBe("Hello");
  });

  it("falls back to Turkish for locale en when no translation exists yet", () => {
    expect(pickLocalizedText("en", "Merhaba", null)).toBe("Merhaba");
    expect(pickLocalizedText("en", "Merhaba", undefined)).toBe("Merhaba");
  });
});
