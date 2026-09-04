import { prisma } from "@/shared/prisma";
import type { CandidateStory, DigestBuilderRepository } from "../application/ports";

export class PrismaDigestRepository implements DigestBuilderRepository {
  async getUnusedSummarizedStories(
    sinceHours: number,
    limit: number,
  ): Promise<CandidateStory[]> {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    const stories = await prisma.story.findMany({
      where: {
        summaries: { some: {} },
        digestItems: { none: {} },
        rawArticles: { some: { publishedAt: { gte: since } } },
      },
      orderBy: { importanceScore: "desc" },
      take: limit,
      select: { id: true, importanceScore: true },
    });

    return stories.map((story) => ({
      storyId: story.id,
      importanceScore: story.importanceScore,
    }));
  }

  async upsertDigestForDate(
    date: Date,
    rankedStoryIds: string[],
  ): Promise<{ digestId: string; itemCount: number }> {
    const digest = await prisma.digest.upsert({
      where: { date },
      create: { date },
      update: {},
    });

    if (rankedStoryIds.length > 0) {
      await prisma.$transaction(
        rankedStoryIds.map((storyId, index) =>
          prisma.digestItem.upsert({
            where: { digestId_storyId: { digestId: digest.id, storyId } },
            create: { digestId: digest.id, storyId, rank: index + 1 },
            update: { rank: index + 1 },
          }),
        ),
      );
    }

    return { digestId: digest.id, itemCount: rankedStoryIds.length };
  }
}
