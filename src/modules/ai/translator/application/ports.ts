export interface SummaryToTranslate {
  summaryId: string;
  storyId: string;
  headline: string;
  body: string;
  whyItMatters: string;
}

export interface TranslatorRepository {
  /** Latest Summary for each given story that has no English translation yet. */
  getUntranslatedSummaries(storyIds: string[]): Promise<SummaryToTranslate[]>;
  /** Latest incomplete summaries in published digests, independent of this run. */
  getPublishedUntranslatedSummaries(excludeStoryIds: string[], limit: number): Promise<SummaryToTranslate[]>;
  saveTranslation(
    summaryId: string,
    output: { headline: string; body: string; whyItMatters: string },
  ): Promise<void>;
}
