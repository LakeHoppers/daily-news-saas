export interface StoryForRanking {
  storyId: string;
  distinctSourceCount: number;
  avgTrustScore: number;
  mostRecentPublishedAt: Date | null;
}

export interface RankingRepository {
  getStoriesForRanking(storyIds: string[]): Promise<StoryForRanking[]>;
  updateImportanceScore(storyId: string, score: number): Promise<void>;
}
