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
    return this.candidates.slice(0, limit);
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
      { storyId: "low", importanceScore: 10 },
      { storyId: "high", importanceScore: 90 },
      { storyId: "mid", importanceScore: 50 },
    ];

    const result = await new BuildDigestUseCase(repository).execute(
      new Date("2026-07-27T15:30:00.000Z"),
    );

    expect(result).toEqual({ digestId: "digest-1", itemCount: 3 });
    expect(repository.upsertCalls[0].rankedStoryIds).toEqual(["high", "mid", "low"]);
  });

  it("truncates the date to a UTC calendar day before upserting", async () => {
    const repository = new FakeRepository();
    repository.candidates = [{ storyId: "a", importanceScore: 1 }];

    await new BuildDigestUseCase(repository).execute(new Date("2026-07-27T23:45:00.000Z"));

    expect(repository.upsertCalls[0].date).toEqual(new Date("2026-07-27T00:00:00.000Z"));
  });

  it("upserts an empty digest when there are no candidate stories", async () => {
    const repository = new FakeRepository();
    const result = await new BuildDigestUseCase(repository).execute(new Date());
    expect(result).toEqual({ digestId: "digest-1", itemCount: 0 });
    expect(repository.upsertCalls[0].rankedStoryIds).toEqual([]);
  });
});
