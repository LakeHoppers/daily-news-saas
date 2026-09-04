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

    for (const source of sources) {
      try {
        const articles = await this.rssFetcher.fetch(source.url);
        for (const article of articles) {
          await this.repository.upsertRawArticle(source.id, article);
        }
        articlesFetched += articles.length;
        succeeded++;
        await this.repository.logScrapeResult(pipelineRunId, source.id, {
          success: true,
          articleCount: articles.length,
        });
      } catch (err) {
        failed++;
        await this.repository.logScrapeResult(pipelineRunId, source.id, {
          success: false,
          articleCount: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { succeeded, failed, articlesFetched };
  }
}
