import { expect, it, vi } from "vitest";
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/shared/prisma", () => ({ prisma: { digest: { findMany } } }));
import { getDigestHistory } from "@/modules/digest/infrastructure/digest-view";
it("localizes history and falls back for untranslated editions without losing category filtering", async () => {
  findMany.mockResolvedValue([{ date: new Date("2026-09-09Z"), items: [
    { rank: 1, storyId: "1", story: { category: "ECONOMY", summaries: [{ headline: "Türkçe", headlineEn: "English" }] } },
    { rank: 2, storyId: "2", story: { category: "ECONOMY", summaries: [{ headline: "Eski haber", headlineEn: null }] } },
  ] }]);
  const en = await getDigestHistory(["ECONOMY"], 14, "en");
  expect(en[0].items.map(item => item.headline)).toEqual(["English", "Eski haber"]);
  expect(findMany.mock.calls[0][0].include.items.where).toEqual({ story: { category: { in: ["ECONOMY"] } } });
  const tr = await getDigestHistory([], 14, "tr");
  expect(tr[0].items[0].headline).toBe("Türkçe");
});
