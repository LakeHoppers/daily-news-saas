import type { RssFetcher } from "../domain/types";
import type { ScraperRepository } from "./ports";

export interface FetchArticlesResult {
  succeeded: number;
  failed: number;
  articlesFetched: number;
}

export class FetchArticlesUseCase {
  constructor(
    private readonly repository: ScraperRepository,
    private readonly rssFetcher: RssFetcher,
  ) {}

  async execute(pipelineRunId: string): Promise<FetchArticlesResult> {
    const sources = await this.repository.getActiveRssSources();

    let succeeded = 0;
    let failed = 0;
    let articlesFetched = 0;

    const results = await Promise.allSettled(sources.map(async (source) => {
      try {
        const articles = await this.rssFetcher.fetch(source.url);
        for (const article of articles) {
          await this.repository.upsertRawArticle(source.id, article);
        }
        await this.repository.logScrapeResult(pipelineRunId, source.id, {
          success: true,
          articleCount: articles.length,
        });
        articlesFetched += articles.length;
        succeeded++;
      } catch (err) {
        failed++;
        await this.repository.logScrapeResult(pipelineRunId, source.id, {
          success: false,
          articleCount: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }));
    // Finish every source before surfacing a failure to persist its scrape log.
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;

    return { succeeded, failed, articlesFetched };
  }
}
