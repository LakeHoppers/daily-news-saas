import type { Category } from "@/generated/prisma/enums";
import type { StoryCentroid } from "../domain/clustering";

export interface UnclusteredArticleRecord {
  id: string;
  title: string;
  rawContent: string;
  sourceCategory: Category | null;
  /** Non-empty if a previous run already embedded this article but couldn't cluster it. */
  existingEmbedding: number[];
}

export interface DedupRepository {
  getUnclusteredArticles(): Promise<UnclusteredArticleRecord[]>;
  getRecentStoryCentroids(sinceHours: number): Promise<StoryCentroid[]>;
  saveEmbedding(articleId: string, embedding: number[]): Promise<void>;
  attachArticlesToStory(storyId: string, articleIds: string[]): Promise<void>;
  /** Creates a new Story with the given category and attaches the articles to it. Returns the new story id. */
  createStory(category: Category, articleIds: string[]): Promise<string>;
}
