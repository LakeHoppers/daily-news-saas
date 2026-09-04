import type { FetchedArticle } from "../domain/types";

export interface RssSourceRecord {
  id: string;
  url: string;
}

export interface ScrapeLogInput {
  success: boolean;
  articleCount: number;
  error?: string;
}

export interface ScraperRepository {
  getActiveRssSources(): Promise<RssSourceRecord[]>;
  upsertRawArticle(sourceId: string, article: FetchedArticle): Promise<void>;
  logScrapeResult(
    pipelineRunId: string,
    sourceId: string,
    result: ScrapeLogInput,
  ): Promise<void>;
}
