import type { Category } from "@/generated/prisma/enums";
import { cosineSimilarity } from "./similarity";

export interface ClusterableItem {
  id: string;
  embedding: number[];
}

/** Union-find clustering: groups items whose pairwise cosine similarity meets the threshold. */
export function clusterBySimilarity<T extends ClusterableItem>(
  items: T[],
  threshold: number,
): T[][] {
  const parent = new Map<string, string>();
  for (const item of items) parent.set(item.id, item.id);

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (cosineSimilarity(items[i].embedding, items[j].embedding) >= threshold) {
        union(items[i].id, items[j].id);
      }
    }
  }

  const groups = new Map<string, T[]>();
  for (const item of items) {
    const root = find(item.id);
    const group = groups.get(root);
    if (group) group.push(item);
    else groups.set(root, [item]);
  }

  return [...groups.values()];
}

export interface StoryCentroid {
  storyId: string;
  centroid: number[];
}

/** Returns the id of the best-matching existing story centroid, or null if none clears the threshold. */
export function findBestCentroidMatch(
  embedding: number[],
  centroids: StoryCentroid[],
  threshold: number,
): string | null {
  let bestStoryId: string | null = null;
  let bestScore = threshold;

  for (const candidate of centroids) {
    const score = cosineSimilarity(embedding, candidate.centroid);
    if (score >= bestScore) {
      bestScore = score;
      bestStoryId = candidate.storyId;
    }
  }

  return bestStoryId;
}

const DEFAULT_CATEGORY: Category = "SOCIETY";

/** Picks the most common source category in a cluster, falling back to a default. */
export function pickCategory(
  cluster: { sourceCategory: Category | null }[],
): Category {
  const counts = new Map<Category, number>();
  for (const item of cluster) {
    if (!item.sourceCategory) continue;
    counts.set(item.sourceCategory, (counts.get(item.sourceCategory) ?? 0) + 1);
  }

  let best: Category | null = null;
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }

  return best ?? DEFAULT_CATEGORY;
}
