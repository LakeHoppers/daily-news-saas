import { prisma } from "@/shared/prisma";
import type { SummaryToTranslate, TranslatorRepository } from "../application/ports";

export class PrismaTranslatorRepository implements TranslatorRepository {
  async getUntranslatedSummaries(storyIds: string[]): Promise<SummaryToTranslate[]> {
    if (storyIds.length === 0) return [];

    const stories = await prisma.story.findMany({
      where: { id: { in: storyIds } },
      select: {
        id: true,
        summaries: { orderBy: { version: "desc" }, take: 1 },
      },
    });

    return stories
      .filter((story) => story.summaries[0] && story.summaries[0].headlineEn === null)
      .map((story) => {
        const summary = story.summaries[0];
        return {
          summaryId: summary.id,
          storyId: story.id,
          headline: summary.headline,
          body: summary.body,
          whyItMatters: summary.whyItMatters,
        };
      });
  }

  async saveTranslation(
    summaryId: string,
    output: { headline: string; body: string; whyItMatters: string },
  ): Promise<void> {
    await prisma.summary.update({
      where: { id: summaryId },
      data: {
        headlineEn: output.headline,
        bodyEn: output.body,
        whyItMattersEn: output.whyItMatters,
      },
    });
  }
}
