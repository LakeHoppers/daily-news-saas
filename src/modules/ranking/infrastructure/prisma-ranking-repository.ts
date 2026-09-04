import { prisma } from "@/shared/prisma";
import type { RankingRepository, StoryForRanking } from "../application/ports";

export class PrismaRankingRepository implements RankingRepository {
  async getStoriesForRanking(storyIds: string[]): Promise<StoryForRanking[]> {
    const stories = await prisma.story.findMany({
      where: { id: { in: storyIds } },
      select: {
        id: true,
        rawArticles: {
          select: {
            sourceId: true,
            publishedAt: true,
            source: { select: { trustScore: true } },
          },
        },
      },
    });

    return stories.map((story) => {
      const trustScoreBySource = new Map<string, number>();
      let mostRecentPublishedAt: Date | null = null;

      for (const article of story.rawArticles) {
        trustScoreBySource.set(article.sourceId, article.source.trustScore);
        if (
          article.publishedAt &&
          (!mostRecentPublishedAt || article.publishedAt > mostRecentPublishedAt)
        ) {
          mostRecentPublishedAt = article.publishedAt;
        }
      }

      const trustScores = [...trustScoreBySource.values()];
      const avgTrustScore =
        trustScores.reduce((sum, score) => sum + score, 0) / trustScores.length;

      return {
        storyId: story.id,
        distinctSourceCount: trustScoreBySource.size,
        avgTrustScore,
        mostRecentPublishedAt,
      };
    });
  }

  async updateImportanceScore(storyId: string, score: number): Promise<void> {
    await prisma.story.update({
      where: { id: storyId },
      data: { importanceScore: score },
    });
  }
}
