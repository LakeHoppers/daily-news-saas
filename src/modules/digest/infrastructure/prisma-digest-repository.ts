import { Category } from "@/generated/prisma/enums";
import { prisma } from "@/shared/prisma";
import type { CandidateStory, DigestBuilderRepository } from "../application/ports";

export class PrismaDigestRepository implements DigestBuilderRepository {
  async getUnusedSummarizedStories(
    sinceHours: number,
    limit: number,
  ): Promise<CandidateStory[]> {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    // A global top-10/100 pool could hide every minority-category candidate.
    // Ten per category is sufficient for any ten-slot selection, and bounds reads.
    const stories = (await Promise.all(Object.values(Category).map((category) =>
      prisma.story.findMany({
        where: {
          category,
          summaries: { some: {} },
          digestItems: { none: {} },
          rawArticles: { some: { publishedAt: { gte: since } } },
        },
        orderBy: [{ importanceScore: "desc" }, { id: "asc" }],
        take: limit,
        select: { id: true, importanceScore: true, category: true },
      }),
    ))).flat();

    return stories.map((story) => ({
      storyId: story.id,
      importanceScore: story.importanceScore,
      category: story.category,
    }));
  }

  async upsertDigestForDate(
    date: Date,
    rankedStoryIds: string[],
  ): Promise<{ digestId: string; itemCount: number }> {
    return prisma.$transaction(async (tx) => {
      const digest = await tx.digest.upsert({
        where: { date },
        create: { date },
        // Updating the parent also serializes replacements for the same edition.
        update: { date },
      });
      await tx.digestItem.deleteMany({
        where: { digestId: digest.id, storyId: { notIn: rankedStoryIds } },
      });
      for (const [index, storyId] of rankedStoryIds.entries()) {
        await tx.digestItem.upsert({
          where: { digestId_storyId: { digestId: digest.id, storyId } },
          create: { digestId: digest.id, storyId, rank: index + 1 },
          update: { rank: index + 1 },
        });
      }
      return { digestId: digest.id, itemCount: rankedStoryIds.length };
    });
  }
}
