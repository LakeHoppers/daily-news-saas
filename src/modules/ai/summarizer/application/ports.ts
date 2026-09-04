import type { Category } from "@/generated/prisma/enums";
import type { SummarizeOutput } from "@/shared/ai-provider.interface";

export interface StoryToSummarize {
  storyId: string;
  candidateCategory: Category;
  articles: { title: string; content: string; sourceUrl: string }[];
}

export interface SummarizerRepository {
  /**
   * Any story that doesn't have a Summary yet, oldest first, up to `limit`.
   * Deliberately not scoped to "touched this run" — a story only needs to be
   * clustered once, but every story still needs a summary eventually, even
   * if a prior pipeline run created it and then crashed before summarizing.
   */
  getStoriesNeedingSummary(limit: number): Promise<StoryToSummarize[]>;
  /** Persists the Summary and lets the AI's category call override the heuristic one from clustering. */
  saveSummary(
    storyId: string,
    output: SummarizeOutput,
    aiProvider: string,
    aiModel: string,
  ): Promise<void>;
}
