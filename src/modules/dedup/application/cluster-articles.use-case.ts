import type { Embedder } from "@/shared/ai-provider.interface";
import {
  clusterBySimilarity,
  findBestCentroidMatch,
  pickCategory,
} from "../domain/clustering";
import type { DedupRepository, UnclusteredArticleRecord } from "./ports";

const EMBEDDING_CONCURRENCY = 15;
const SIMILARITY_THRESHOLD = 0.83;
const EXISTING_STORY_WINDOW_HOURS = 48;
const MAX_EMBEDDING_INPUT_CHARS = 4000;
/**
 * Caps articles embedded per run so a large backlog (e.g. right after adding
 * new sources) can't push a single serverless invocation past its time
 * limit. Leftover articles stay unclustered (storyId: null) and are picked
 * up by the next run, same as an embedding failure already leaves them.
 */
const MAX_ARTICLES_PER_RUN = 150;

export interface ClusterArticlesResult {
  embedded: number;
  failed: number;
  attachedToExisting: number;
  newStories: number;
  touchedStoryIds: string[];
}

export class ClusterArticlesUseCase {
  constructor(
    private readonly repository: DedupRepository,
    private readonly embedder: Embedder,
  ) {}

  async execute(limit: number = MAX_ARTICLES_PER_RUN): Promise<ClusterArticlesResult> {
    const articles = await this.repository.getUnclusteredArticles(limit);
    if (articles.length === 0) {
      return { embedded: 0, failed: 0, attachedToExisting: 0, newStories: 0, touchedStoryIds: [] };
    }

    const embeddings = new Map<string, number[]>();
    let embedded = 0;
    let failed = 0;
    let nextArticle = 0;
    await Promise.all(Array.from(
      { length: Math.min(EMBEDDING_CONCURRENCY, articles.length) },
      async () => {
        while (nextArticle < articles.length) {
          const article = articles[nextArticle++];
          if (article.existingEmbedding.length > 0) {
            embeddings.set(article.id, article.existingEmbedding);
            continue;
          }
          try {
            const text = `${article.title}\n${article.rawContent}`.slice(0, MAX_EMBEDDING_INPUT_CHARS);
            const embedding = await this.embedder.embed(text);
            await this.repository.saveEmbedding(article.id, embedding);
            embeddings.set(article.id, embedding);
            embedded++;
          } catch {
            // Leave this article unclustered so a subsequent run can retry it.
            failed++;
          }
        }
      },
    ));

    const existingCentroids = await this.repository.getRecentStoryCentroids(
      EXISTING_STORY_WINDOW_HOURS,
    );

    const remaining: UnclusteredArticleRecord[] = [];
    const touchedStoryIds = new Set<string>();
    let attachedToExisting = 0;

    for (const article of articles) {
      const embedding = embeddings.get(article.id);
      if (!embedding) continue;
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
      failed,
      attachedToExisting,
      newStories,
      touchedStoryIds: [...touchedStoryIds],
    };
  }
}
