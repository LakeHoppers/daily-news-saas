import { prisma } from "@/shared/prisma";
import type { FetchedArticle } from "../domain/types";
import type {
  RssSourceRecord,
  ScrapeLogInput,
  ScraperRepository,
} from "../application/ports";

export class PrismaScraperRepository implements ScraperRepository {
  async getActiveRssSources(): Promise<RssSourceRecord[]> {
    return prisma.source.findMany({
      where: { active: true, type: "RSS" },
      select: { id: true, url: true },
    });
  }

  async upsertRawArticle(
    sourceId: string,
    article: FetchedArticle,
  ): Promise<void> {
    await prisma.rawArticle.upsert({
      where: {
        sourceId_externalId: { sourceId, externalId: article.externalId },
      },
      create: {
        sourceId,
        externalId: article.externalId,
        url: article.url,
        title: article.title,
        rawContent: article.rawContent,
        publishedAt: article.publishedAt,
      },
      update: {},
    });
  }

  async logScrapeResult(
    pipelineRunId: string,
    sourceId: string,
    result: ScrapeLogInput,
  ): Promise<void> {
    await prisma.scrapeLog.create({
      data: {
        pipelineRunId,
        sourceId,
        success: result.success,
        articleCount: result.articleCount,
        error: result.error,
      },
    });
  }
}
