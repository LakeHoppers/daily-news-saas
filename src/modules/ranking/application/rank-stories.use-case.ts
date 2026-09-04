import { computeImportanceScore } from "../domain/scoring";
import type { RankingRepository } from "./ports";

export interface RankStoriesResult {
  ranked: number;
}

export class RankStoriesUseCase {
  constructor(private readonly repository: RankingRepository) {}

  async execute(storyIds: string[]): Promise<RankStoriesResult> {
    if (storyIds.length === 0) return { ranked: 0 };

    const stories = await this.repository.getStoriesForRanking(storyIds);

    for (const story of stories) {
      const score = computeImportanceScore({
        distinctSourceCount: story.distinctSourceCount,
        avgTrustScore: story.avgTrustScore,
        mostRecentPublishedAt: story.mostRecentPublishedAt,
      });
      await this.repository.updateImportanceScore(story.storyId, score);
    }

    return { ranked: stories.length };
  }
}
