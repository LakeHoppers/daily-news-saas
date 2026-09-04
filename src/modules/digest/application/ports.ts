export interface CandidateStory {
  storyId: string;
  importanceScore: number;
}

export interface DigestBuilderRepository {
  /** Summarized stories not yet placed in any digest, with at least one article published within `sinceHours`. */
  getUnusedSummarizedStories(sinceHours: number, limit: number): Promise<CandidateStory[]>;
  /** Get-or-create the Digest for `date` and set its items to exactly `rankedStoryIds`, in order. */
  upsertDigestForDate(
    date: Date,
    rankedStoryIds: string[],
  ): Promise<{ digestId: string; itemCount: number }>;
}
