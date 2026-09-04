import { describe, expect, it } from "vitest";
import { buildDigestEmail } from "@/modules/notification/domain/email-template";
import type { DigestView } from "@/modules/digest/domain/types";

const DIGEST: DigestView = {
  digestId: "digest-1",
  date: "2026-07-27",
  items: [
    {
      rank: 1,
      storyId: "story-1",
      category: "POLITICS",
      headline: "Bir <script>alert(1)</script> başlık",
      summary: "İlk paragraf.\nİkinci paragraf.",
      whyItMatters: "Önemli çünkü \"test\".",
      tags: ["etiket"],
      sourceUrls: ["https://example.de/a"],
    },
  ],
};

describe("buildDigestEmail", () => {
  it("includes the date and item count in the subject", () => {
    const { subject } = buildDigestEmail(DIGEST);
    expect(subject).toContain("2026-07-27");
    expect(subject).toContain("1 haber");
  });

  it("escapes HTML-unsafe characters from AI-generated content", () => {
    const { html } = buildDigestEmail(DIGEST);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes the plain-text fallback with headline and why-it-matters", () => {
    const { text } = buildDigestEmail(DIGEST);
    expect(text).toContain("İlk paragraf.");
    expect(text).toContain("Önemli çünkü");
  });

  it("renders one block per digest item", () => {
    const twoItemDigest: DigestView = {
      ...DIGEST,
      items: [DIGEST.items[0], { ...DIGEST.items[0], storyId: "story-2", rank: 2 }],
    };
    const { text } = buildDigestEmail(twoItemDigest);
    expect(text.split("---")).toHaveLength(2);
  });
});
