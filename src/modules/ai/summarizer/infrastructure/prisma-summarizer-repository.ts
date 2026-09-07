import { prisma } from "@/shared/prisma";
import type { SummarizeOutput } from "@/shared/ai-provider.interface";
import type { SummarizerRepository, StoryToSummarize } from "../application/ports";

export class PrismaSummarizerRepository implements SummarizerRepository {
  async getStoriesNeedingSummary(limit: number): Promise<StoryToSummarize[]> {
    const stories = await prisma.story.findMany({
      where: { summaries: { none: {} } },
      // Highest-importance first, not oldest-first: only the top few stories
      // ever make the digest, so summarization budget should go to whatever
      // is currently most likely to matter, not whatever's been waiting longest.
      orderBy: { importanceScore: "desc" },
      take: limit,
      select: {
        id: true,
        category: true,
        rawArticles: { select: { title: true, rawContent: true, url: true } },
      },
    });

    return stories.map((story) => ({
      storyId: story.id,
      candidateCategory: story.category,
      articles: story.rawArticles.map((article) => ({
        title: article.title,
        content: article.rawContent,
        sourceUrl: article.url,
      })),
    }));
  }

  async saveSummary(
    storyId: string,
    output: SummarizeOutput,
    aiProvider: string,
    aiModel: string,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.summary.create({
        data: {
          storyId,
          headline: output.headline,
          body: output.body,
          whyItMatters: output.whyItMatters,
          tags: output.tags,
          aiProvider,
          aiModel,
        },
      }),
      prisma.story.update({
        where: { id: storyId },
        data: { category: output.category },
      }),
    ]);
  }
}
