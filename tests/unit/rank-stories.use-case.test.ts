import { describe, expect, it } from "vitest";
import { RankStoriesUseCase } from "@/modules/ranking/application/rank-stories.use-case";
import type {
  RankingRepository,
  StoryForRanking,
} from "@/modules/ranking/application/ports";

class FakeRankingRepository implements RankingRepository {
  stories: StoryForRanking[] = [];
  updatedScores: Record<string, number> = {};

  async getStoriesForRanking(storyIds: string[]) {
    return this.stories.filter((story) => storyIds.includes(story.storyId));
  }
  async updateImportanceScore(storyId: string, score: number) {
    this.updatedScores[storyId] = score;
  }
}

describe("RankStoriesUseCase", () => {
  it("scores every requested story and writes the result back", async () => {
    const repository = new FakeRankingRepository();
    repository.stories = [
      {
        storyId: "s1",
        distinctSourceCount: 3,
        avgTrustScore: 90,
        mostRecentPublishedAt: new Date(),
      },
      {
        storyId: "s2",
        distinctSourceCount: 1,
        avgTrustScore: 50,
        mostRecentPublishedAt: null,
      },
    ];

    const result = await new RankStoriesUseCase(repository).execute(["s1", "s2"]);

    expect(result.ranked).toBe(2);
    expect(Object.keys(repository.updatedScores).sort()).toEqual(["s1", "s2"]);
    expect(repository.updatedScores.s1).toBeGreaterThan(repository.updatedScores.s2);
  });

  it("skips the repository entirely when there are no story ids", async () => {
    const repository = new FakeRankingRepository();
    const result = await new RankStoriesUseCase(repository).execute([]);
    expect(result).toEqual({ ranked: 0 });
    expect(Object.keys(repository.updatedScores)).toHaveLength(0);
  });
});
