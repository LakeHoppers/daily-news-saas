import type { Category } from "@/generated/prisma/enums";
import { prisma } from "@/shared/prisma";
import { averageVectors } from "../domain/similarity";
import type { StoryCentroid } from "../domain/clustering";
import type { DedupRepository, UnclusteredArticleRecord } from "../application/ports";

export class PrismaDedupRepository implements DedupRepository {
  async getUnclusteredArticles(): Promise<UnclusteredArticleRecord[]> {
    const articles = await prisma.rawArticle.findMany({
      where: { storyId: null },
      select: {
        id: true,
        title: true,
        rawContent: true,
        embedding: true,
        source: { select: { category: true } },
      },
    });

    return articles.map((article) => ({
      id: article.id,
      title: article.title,
      rawContent: article.rawContent,
      sourceCategory: article.source.category,
      existingEmbedding: article.embedding,
    }));
  }

  async getRecentStoryCentroids(sinceHours: number): Promise<StoryCentroid[]> {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const stories = await prisma.story.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, rawArticles: { select: { embedding: true } } },
    });

    const centroids: StoryCentroid[] = [];
    for (const story of stories) {
      const vectors = story.rawArticles
        .map((article) => article.embedding)
        .filter((embedding) => embedding.length > 0);
      if (vectors.length === 0) continue;
      centroids.push({ storyId: story.id, centroid: averageVectors(vectors) });
    }
    return centroids;
  }

  async saveEmbedding(articleId: string, embedding: number[]): Promise<void> {
    await prisma.rawArticle.update({
      where: { id: articleId },
      data: { embedding },
    });
  }

  async attachArticlesToStory(storyId: string, articleIds: string[]): Promise<void> {
    await prisma.rawArticle.updateMany({
      where: { id: { in: articleIds } },
      data: { storyId },
    });
  }

  async createStory(category: Category, articleIds: string[]): Promise<string> {
    const story = await prisma.story.create({ data: { category } });
    await prisma.rawArticle.updateMany({
      where: { id: { in: articleIds } },
      data: { storyId: story.id },
    });
    return story.id;
  }
}
