import type { Embedder } from "@/shared/ai-provider.interface";
import {
  clusterBySimilarity,
  findBestCentroidMatch,
  pickCategory,
} from "../domain/clustering";
import type { DedupRepository, UnclusteredArticleRecord } from "./ports";

const SIMILARITY_THRESHOLD = 0.83;
const EXISTING_STORY_WINDOW_HOURS = 48;
const MAX_EMBEDDING_INPUT_CHARS = 4000;

export interface ClusterArticlesResult {
  embedded: number;
  attachedToExisting: number;
  newStories: number;
  touchedStoryIds: string[];
}

export class ClusterArticlesUseCase {
  constructor(
    private readonly repository: DedupRepository,
    private readonly embedder: Embedder,
  ) {}

  async execute(): Promise<ClusterArticlesResult> {
    const articles = await this.repository.getUnclusteredArticles();
    if (articles.length === 0) {
      return { embedded: 0, attachedToExisting: 0, newStories: 0, touchedStoryIds: [] };
    }

    const embeddings = new Map<string, number[]>();
    let embedded = 0;
    for (const article of articles) {
      if (article.existingEmbedding.length > 0) {
        embeddings.set(article.id, article.existingEmbedding);
        continue;
      }
      const text = `${article.title}\n${article.rawContent}`.slice(
        0,
        MAX_EMBEDDING_INPUT_CHARS,
      );
      const embedding = await this.embedder.embed(text);
      embeddings.set(article.id, embedding);
      await this.repository.saveEmbedding(article.id, embedding);
      embedded++;
    }

    const existingCentroids = await this.repository.getRecentStoryCentroids(
      EXISTING_STORY_WINDOW_HOURS,
    );

    const remaining: UnclusteredArticleRecord[] = [];
    const touchedStoryIds = new Set<string>();
    let attachedToExisting = 0;

    for (const article of articles) {
      const embedding = embeddings.get(article.id)!;
      const matchedStoryId = findBestCentroidMatch(
        embedding,
        existingCentroids,
        SIMILARITY_THRESHOLD,
      );
      if (matchedStoryId) {
        await this.repository.attachArticlesToStory(matchedStoryId, [article.id]);
        touchedStoryIds.add(matchedStoryId);
        attachedToExisting++;
      } else {
        remaining.push(article);
      }
    }

    const clusters = clusterBySimilarity(
      remaining.map((article) => ({ id: article.id, embedding: embeddings.get(article.id)! })),
      SIMILARITY_THRESHOLD,
    );

    let newStories = 0;
    for (const cluster of clusters) {
      const clusterArticles = cluster.map(
        (item) => remaining.find((article) => article.id === item.id)!,
      );
      const category = pickCategory(clusterArticles);
      const storyId = await this.repository.createStory(
        category,
        clusterArticles.map((article) => article.id),
      );
      touchedStoryIds.add(storyId);
      newStories++;
    }

    return {
      embedded,
      attachedToExisting,
      newStories,
      touchedStoryIds: [...touchedStoryIds],
    };
  }
}
