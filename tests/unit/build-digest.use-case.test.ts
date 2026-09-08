import { describe, expect, it } from "vitest";
import { BuildDigestUseCase } from "@/modules/digest/application/build-digest.use-case";
import type {
  CandidateStory,
  DigestBuilderRepository,
} from "@/modules/digest/application/ports";

class FakeRepository implements DigestBuilderRepository {
  candidates: CandidateStory[] = [];
  upsertCalls: { date: Date; rankedStoryIds: string[] }[] = [];

  async getUnusedSummarizedStories(_sinceHours: number, limit: number) {
    return this.candidates.filter((candidate, index, all) =>
      all.slice(0, index).filter((previous) => previous.category === candidate.category).length < limit,
    );
  }

  async upsertDigestForDate(date: Date, rankedStoryIds: string[]) {
    this.upsertCalls.push({ date, rankedStoryIds });
    return { digestId: "digest-1", itemCount: rankedStoryIds.length };
  }
}

describe("BuildDigestUseCase", () => {
  it("orders candidates by importanceScore descending regardless of input order", async () => {
    const repository = new FakeRepository();
    repository.candidates = [
      { storyId: "low", importanceScore: 10, category: "POLITICS" },
      { storyId: "high", importanceScore: 90, category: "POLITICS" },
      { storyId: "mid", importanceScore: 50, category: "POLITICS" },
    ];

    const result = await new BuildDigestUseCase(repository).execute(
      new Date("2026-07-27T15:30:00.000Z"),
    );

    expect(result).toEqual({
      digestId: "digest-1",
      itemCount: 3,
      storyIds: ["high", "mid", "low"],
    });
    expect(repository.upsertCalls[0].rankedStoryIds).toEqual(["high", "mid", "low"]);
  });

  it("truncates the date to a UTC calendar day before upserting", async () => {
    const repository = new FakeRepository();
    repository.candidates = [{ storyId: "a", importanceScore: 1, category: "POLITICS" }];

    await new BuildDigestUseCase(repository).execute(new Date("2026-07-27T23:45:00.000Z"));

    expect(repository.upsertCalls[0].date).toEqual(new Date("2026-07-27T00:00:00.000Z"));
  });

  it("upserts an empty digest when there are no candidate stories", async () => {
    const repository = new FakeRepository();
    const result = await new BuildDigestUseCase(repository).execute(new Date());
    expect(result).toEqual({ digestId: "digest-1", itemCount: 0, storyIds: [] });
    expect(repository.upsertCalls[0].rankedStoryIds).toEqual([]);
  });
});

it("caps dominant categories at four when other candidates can fill ten slots", async () => {
  const repository = new FakeRepository();
  repository.candidates = [
    ...Array.from({ length: 30 }, (_, i): CandidateStory => ({ storyId: `p${i}`, importanceScore: 100-i, category: "POLITICS" })),
    ...Array.from({ length: 4 }, (_, i): CandidateStory => ({ storyId: `t${i}`, importanceScore: 50-i, category: "TECHNOLOGY" })),
    ...Array.from({ length: 4 }, (_, i): CandidateStory => ({ storyId: `s${i}`, importanceScore: 40-i, category: "SPORTS" })),
  ];
  expect((await new BuildDigestUseCase(repository).execute()).itemCount).toBe(10);
  expect(repository.upsertCalls[0].rankedStoryIds).toEqual(["p0", "p1", "p2", "p3", "t0", "t1", "t2", "t3", "s0", "s1"]);
});
it("fills ten slots by importance on a single-category day", async () => {
  const repository = new FakeRepository();
  repository.candidates = Array.from({ length: 15 }, (_, i) => ({ storyId: `p${i}`, importanceScore: 100-i, category: "POLITICS" }));
  expect((await new BuildDigestUseCase(repository).execute()).itemCount).toBe(10);
  expect(repository.upsertCalls[0].rankedStoryIds).toEqual(Array.from({ length: 10 }, (_, i) => `p${i}`));
});
it("fills limited variety and resolves equal scores deterministically", async () => {
  const repository = new FakeRepository();
  repository.candidates = [
    ...Array.from({ length: 10 }, (_, i): CandidateStory => ({ storyId: `p${9-i}`, importanceScore: 100, category: "POLITICS" })),
    { storyId: "sport", importanceScore: 1, category: "SPORTS" },
  ];
  await new BuildDigestUseCase(repository).execute();
  expect(repository.upsertCalls[0].rankedStoryIds).toEqual(["p0","p1","p2","p3","p4","p5","p6","p7","p8","sport"]);
});
