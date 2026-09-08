import { beforeEach, describe, expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: { $transaction: vi.fn(), story: { findMany: vi.fn() } } }));
vi.mock("@/shared/prisma", () => ({ prisma: db }));
import { PrismaDigestRepository } from "@/modules/digest/infrastructure/prisma-digest-repository";
import { Category } from "@/generated/prisma/enums";

describe("PrismaDigestRepository", () => {
  let items: { digestId: string; storyId: string; rank: number }[];
  let failStory: string | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    items = [{ digestId: "other-day", storyId: "other", rank: 1 }];
    failStory = undefined;
    db.$transaction.mockImplementation(async (callback) => {
      const snapshot = structuredClone(items);
      const tx = {
        digest: { upsert: vi.fn().mockResolvedValue({ id: "today" }) },
        digestItem: {
          deleteMany: async ({ where }: { where: { digestId: string; storyId: { notIn: string[] } } }) => {
            items = items.filter((item) => item.digestId !== where.digestId || where.storyId.notIn.includes(item.storyId));
          },
          upsert: async ({ create, update }: { create: { digestId: string; storyId: string; rank: number }; update: { rank: number } }) => {
            if (create.storyId === failStory) throw new Error("write failed");
            const existing = items.find((i) => i.digestId === create.digestId && i.storyId === create.storyId);
            if (existing) existing.rank = update.rank;
            else items.push(create);
          },
        },
      };
      try { return await callback(tx); } catch (error) { items = snapshot; throw error; }
    });
  });
  it("replaces two same-day runs instead of accumulating their union", async () => {
    const repo = new PrismaDigestRepository();
    const date = new Date("2026-09-08T00:00:00Z");
    await repo.upsertDigestForDate(date, ["a", "b", "c"]);
    expect(await repo.upsertDigestForDate(date, ["c", "d"])).toEqual({ digestId: "today", itemCount: 2 });
    expect(items.filter((i) => i.digestId === "today")).toEqual([
      { digestId: "today", storyId: "c", rank: 1 },
      { digestId: "today", storyId: "d", rank: 2 },
    ]);
    expect(items).toContainEqual({ digestId: "other-day", storyId: "other", rank: 1 });
  });
  it("clears all items for an empty replacement", async () => {
    const repo = new PrismaDigestRepository();
    await repo.upsertDigestForDate(new Date(), ["a"]);
    await repo.upsertDigestForDate(new Date(), []);
    expect(items.filter((i) => i.digestId === "today")).toEqual([]);
  });
  it("keeps the original set when a replacement write fails", async () => {
    const repo = new PrismaDigestRepository();
    await repo.upsertDigestForDate(new Date(), ["a"]);
    failStory = "bad";
    await expect(repo.upsertDigestForDate(new Date(), ["b", "bad"])).rejects.toThrow("write failed");
    expect(items.filter((i) => i.digestId === "today")).toEqual([{ digestId: "today", storyId: "a", rank: 1 }]);
  });
  it("fetches a bounded pool from every category, including minority categories", async () => {
    db.story.findMany.mockImplementation(async ({ where }) => [{ id: where.category, category: where.category, importanceScore: 1 }]);
    const result = await new PrismaDigestRepository().getUnusedSummarizedStories(48, 10);
    expect(result).toHaveLength(Object.keys(Category).length);
    for (const category of Object.values(Category)) {
      expect(db.story.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ category, digestItems: { none: {} } }), take: 10,
      }));
    }
  });
});
