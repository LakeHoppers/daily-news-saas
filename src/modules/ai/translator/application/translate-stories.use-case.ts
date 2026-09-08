import type { Translator } from "@/shared/ai-provider.interface";
import type { TranslatorRepository } from "./ports";

// Runs after digest assembly, translating only the day's ~10 chosen
// stories — much cheaper than re-summarizing in English, since it's one
// straight-translation call per story instead of a full extract+generate
// pass. Concurrency mirrors the summarizer's (one chat call per worker).
const TRANSLATION_CONCURRENCY = 5;

export interface TranslateStoriesResult {
  translated: number;
  failed: number;
}

export class TranslateStoriesUseCase {
  constructor(
    private readonly repository: TranslatorRepository,
    private readonly translator: Translator,
  ) {}

  async execute(storyIds: string[]): Promise<TranslateStoriesResult> {
    const summaries = await this.repository.getUntranslatedSummaries(storyIds);

    let translated = 0;
    let failed = 0;

    let next = 0;
    await Promise.all(Array.from(
      { length: Math.min(TRANSLATION_CONCURRENCY, summaries.length) },
      async () => {
        while (next < summaries.length) {
          const summary = summaries[next++];
          try {
            const output = await this.translator.translate({
              headline: summary.headline,
              body: summary.body,
              whyItMatters: summary.whyItMatters,
            });
            await this.repository.saveTranslation(summary.summaryId, output);
            translated++;
          } catch {
            failed++;
          }
        }
      },
    ));

    return { translated, failed };
  }
}
