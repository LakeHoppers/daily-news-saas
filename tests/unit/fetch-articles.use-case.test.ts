import { describe, expect, it } from "vitest";
import { FetchArticlesUseCase } from "@/modules/scraper/application/fetch-articles.use-case";
import type {
  RssSourceRecord,
  ScrapeLogInput,
  ScraperRepository,
} from "@/modules/scraper/application/ports";
import type { FetchedArticle, RssFetcher } from "@/modules/scraper/domain/types";

class FakeRepository implements ScraperRepository {
  sources: RssSourceRecord[] = [];
  savedArticles: { sourceId: string; article: FetchedArticle }[] = [];
  logs: { pipelineRunId: string; sourceId: string; result: ScrapeLogInput }[] = [];

  async getActiveRssSources() {
    return this.sources;
  }

  async upsertRawArticle(sourceId: string, article: FetchedArticle) {
    this.savedArticles.push({ sourceId, article });
  }

  async logScrapeResult(
    pipelineRunId: string,
    sourceId: string,
    result: ScrapeLogInput,
  ) {
    this.logs.push({ pipelineRunId, sourceId, result });
  }
}

class FakeRssFetcher implements RssFetcher {
  constructor(
    private readonly responses: Record<string, FetchedArticle[] | Error>,
  ) {}

  async fetch(feedUrl: string): Promise<FetchedArticle[]> {
    const response = this.responses[feedUrl];
    if (response instanceof Error) throw response;
    return response ?? [];
  }
}

function article(overrides: Partial<FetchedArticle> = {}): FetchedArticle {
  return {
    externalId: "guid-1",
    url: "https://example.de/a",
    title: "Title",
    rawContent: "Content",
    publishedAt: null,
    ...overrides,
  };
}

describe("FetchArticlesUseCase", () => {
  it("persists fetched articles and logs a success per source", async () => {
    const repository = new FakeRepository();
    repository.sources = [{ id: "src-1", url: "https://feed.example/a" }];

    const useCase = new FetchArticlesUseCase(
      repository,
      new FakeRssFetcher({
        "https://feed.example/a": [article(), article({ externalId: "guid-2" })],
      }),
    );

    const result = await useCase.execute("run-1");

    expect(result).toEqual({ succeeded: 1, failed: 0, articlesFetched: 2 });
    expect(repository.savedArticles).toHaveLength(2);
    expect(repository.logs).toEqual([
      { pipelineRunId: "run-1", sourceId: "src-1", result: { success: true, articleCount: 2 } },
    ]);
  });

  it("logs a failure for a source whose fetch throws, without stopping other sources", async () => {
    const repository = new FakeRepository();
    repository.sources = [
      { id: "src-broken", url: "https://feed.example/broken" },
      { id: "src-ok", url: "https://feed.example/ok" },
    ];

    const useCase = new FetchArticlesUseCase(
      repository,
      new FakeRssFetcher({
        "https://feed.example/broken": new Error("feed unreachable"),
        "https://feed.example/ok": [article()],
      }),
    );

    const result = await useCase.execute("run-2");

    expect(result).toEqual({ succeeded: 1, failed: 1, articlesFetched: 1 });
    expect(repository.logs).toEqual([
      {
        pipelineRunId: "run-2",
        sourceId: "src-broken",
        result: { success: false, articleCount: 0, error: "feed unreachable" },
      },
      {
        pipelineRunId: "run-2",
        sourceId: "src-ok",
        result: { success: true, articleCount: 1 },
      },
    ]);
    expect(repository.savedArticles).toHaveLength(1);
  });
});
