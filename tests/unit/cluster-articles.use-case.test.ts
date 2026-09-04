import { describe, expect, it } from "vitest";
import { ClusterArticlesUseCase } from "@/modules/dedup/application/cluster-articles.use-case";
import type {
  DedupRepository,
  UnclusteredArticleRecord,
} from "@/modules/dedup/application/ports";
import type { StoryCentroid } from "@/modules/dedup/domain/clustering";
import type { Embedder } from "@/shared/ai-provider.interface";
import type { Category } from "@/generated/prisma/enums";

class FakeEmbedder implements Embedder {
  constructor(private readonly vectors: Record<string, number[]>) {}
  async embed(text: string): Promise<number[]> {
    const vector = this.vectors[text];
    if (!vector) throw new Error(`No fake embedding for text: ${text}`);
    return vector;
  }
}

class FakeRepository implements DedupRepository {
  articles: UnclusteredArticleRecord[] = [];
  centroids: StoryCentroid[] = [];
  savedEmbeddings: Record<string, number[]> = {};
  attachments: { storyId: string; articleIds: string[] }[] = [];
  createdStories: { category: Category; articleIds: string[] }[] = [];
  private nextStoryId = 1;

  async getUnclusteredArticles() {
    return this.articles;
  }
  async getRecentStoryCentroids() {
    return this.centroids;
  }
  async saveEmbedding(articleId: string, embedding: number[]) {
    this.savedEmbeddings[articleId] = embedding;
  }
  async attachArticlesToStory(storyId: string, articleIds: string[]) {
    this.attachments.push({ storyId, articleIds });
  }
  async createStory(category: Category, articleIds: string[]) {
    const storyId = `story-${this.nextStoryId++}`;
    this.createdStories.push({ category, articleIds });
    return storyId;
  }
}

function makeArticle(
  overrides: Partial<UnclusteredArticleRecord> & { id: string },
): UnclusteredArticleRecord {
  return {
    title: "Title",
    rawContent: "Content",
    sourceCategory: "POLITICS",
    existingEmbedding: [],
    ...overrides,
  };
}

describe("ClusterArticlesUseCase", () => {
  it("embeds new articles, clusters similar ones into a new story, and skips already-embedded articles", async () => {
    const repository = new FakeRepository();
    repository.articles = [
      makeArticle({ id: "a1", title: "T1", rawContent: "C1" }),
      makeArticle({ id: "a2", title: "T2", rawContent: "C2" }),
      makeArticle({ id: "a3", existingEmbedding: [0, 1, 0] }), // already embedded, unrelated
    ];

    const embedder = new FakeEmbedder({
      "T1\nC1": [1, 0, 0],
      "T2\nC2": [0.99, 0.01, 0],
    });

    const useCase = new ClusterArticlesUseCase(repository, embedder);
    const result = await useCase.execute();

    expect(result.embedded).toBe(2); // a3 reused its existing embedding
    expect(repository.savedEmbeddings).toEqual({
      a1: [1, 0, 0],
      a2: [0.99, 0.01, 0],
    });
    expect(result.newStories).toBe(2); // {a1, a2} cluster + {a3} singleton
    expect(result.attachedToExisting).toBe(0);

    const clusterWithBoth = repository.createdStories.find(
      (s) => s.articleIds.length === 2,
    );
    expect(clusterWithBoth?.articleIds.sort()).toEqual(["a1", "a2"]);
    expect(clusterWithBoth?.category).toBe("POLITICS");
  });

  it("attaches a matching article to an existing recent story instead of creating a new one", async () => {
    const repository = new FakeRepository();
    repository.articles = [makeArticle({ id: "a1", title: "T1", rawContent: "C1" })];
    repository.centroids = [{ storyId: "existing-story", centroid: [1, 0, 0] }];

    const embedder = new FakeEmbedder({ "T1\nC1": [0.99, 0.01, 0] });

    const useCase = new ClusterArticlesUseCase(repository, embedder);
    const result = await useCase.execute();

    expect(result.attachedToExisting).toBe(1);
    expect(result.newStories).toBe(0);
    expect(repository.attachments).toEqual([
      { storyId: "existing-story", articleIds: ["a1"] },
    ]);
    expect(result.touchedStoryIds).toEqual(["existing-story"]);
  });

  it("does nothing when there are no unclustered articles", async () => {
    const repository = new FakeRepository();
    const useCase = new ClusterArticlesUseCase(repository, new FakeEmbedder({}));
    const result = await useCase.execute();
    expect(result).toEqual({
      embedded: 0,
      attachedToExisting: 0,
      newStories: 0,
      touchedStoryIds: [],
    });
  });
});
