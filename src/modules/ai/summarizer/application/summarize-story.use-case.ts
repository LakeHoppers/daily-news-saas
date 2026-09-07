import type { FactExtractor, Summarizer } from "@/shared/ai-provider.interface";
import type { SummarizerRepository } from "./ports";

const MAX_ARTICLE_CONTENT_CHARS = 2000;
// The digest only ever takes the top 10 stories by importance (see
// MAX_DIGEST_ITEMS in build-digest.use-case.ts). Summarizing far more than
// that per run is pure waste — slower, costlier, and it's what made runs
// take 15-30 minutes. This is intentionally just a small buffer over 10 to
// absorb a few failures, not a real backlog-clearing budget.
const DEFAULT_STORY_LIMIT = 15;

export interface SummarizeStoriesResult {
  summarized: number;
  failed: number;
}

export class SummarizeStoryUseCase {
  constructor(
    private readonly repository: SummarizerRepository,
    private readonly factExtractor: FactExtractor,
    private readonly summarizer: Summarizer,
    private readonly providerName: string,
    private readonly modelName: string,
  ) {}

  async execute(limit: number = DEFAULT_STORY_LIMIT): Promise<SummarizeStoriesResult> {
    const stories = await this.repository.getStoriesNeedingSummary(limit);

    let summarized = 0;
    let failed = 0;

    for (const story of stories) {
      try {
        const { facts } = await this.factExtractor.extractFacts({
          articles: story.articles.map((article) => ({
            ...article,
            content: article.content.slice(0, MAX_ARTICLE_CONTENT_CHARS),
          })),
        });

        const output = await this.summarizer.summarize({
          sourceFacts: facts,
          sourceUrls: story.articles.map((article) => article.sourceUrl),
          candidateCategory: story.candidateCategory,
        });

        await this.repository.saveSummary(
          story.storyId,
          output,
          this.providerName,
          this.modelName,
        );
        summarized++;
      } catch {
        failed++;
      }
    }

    return { summarized, failed };
  }
}
