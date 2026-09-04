import { describe, expect, it } from "vitest";
import {
  clusterBySimilarity,
  findBestCentroidMatch,
  pickCategory,
} from "@/modules/dedup/domain/clustering";

describe("clusterBySimilarity", () => {
  it("groups near-identical vectors and separates dissimilar ones", () => {
    const items = [
      { id: "a", embedding: [1, 0, 0] },
      { id: "b", embedding: [0.99, 0.01, 0] },
      { id: "c", embedding: [0, 1, 0] },
    ];

    const clusters = clusterBySimilarity(items, 0.9);
    const ids = clusters.map((cluster) => cluster.map((item) => item.id).sort());

    expect(clusters).toHaveLength(2);
    expect(ids).toContainEqual(["a", "b"]);
    expect(ids).toContainEqual(["c"]);
  });

  it("chains similarity transitively (union-find, not pairwise-only)", () => {
    // a is 30° from b, b is 30° from c (cos 30° ≈ 0.866, above threshold),
    // but a is 60° from c (cos 60° = 0.5, below threshold) — should still
    // merge into one cluster via the a-b-c chain.
    const items = [
      { id: "a", embedding: [1, 0] },
      { id: "b", embedding: [0.8660254, 0.5] },
      { id: "c", embedding: [0.5, 0.8660254] },
    ];

    const clusters = clusterBySimilarity(items, 0.8);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((item) => item.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("returns each item as its own singleton cluster when nothing matches", () => {
    const items = [
      { id: "a", embedding: [1, 0] },
      { id: "b", embedding: [0, 1] },
    ];
    expect(clusterBySimilarity(items, 0.99)).toHaveLength(2);
  });
});

describe("findBestCentroidMatch", () => {
  it("returns the id of the highest-scoring centroid above threshold", () => {
    const centroids = [
      { storyId: "s1", centroid: [1, 0] },
      { storyId: "s2", centroid: [0, 1] },
    ];
    // [0.5, 0.9] is far closer to s2 ([0,1]) than to s1 ([1,0]); s1 doesn't
    // even clear the threshold.
    expect(findBestCentroidMatch([0.5, 0.9], centroids, 0.8)).toBe("s2");
  });

  it("returns null when nothing clears the threshold", () => {
    const centroids = [{ storyId: "s1", centroid: [0, 1] }];
    expect(findBestCentroidMatch([1, 0], centroids, 0.8)).toBeNull();
  });
});

describe("pickCategory", () => {
  it("picks the most frequent source category", () => {
    const category = pickCategory([
      { sourceCategory: "ECONOMY" },
      { sourceCategory: "ECONOMY" },
      { sourceCategory: "POLITICS" },
    ]);
    expect(category).toBe("ECONOMY");
  });

  it("falls back to SOCIETY when no source has a category", () => {
    expect(pickCategory([{ sourceCategory: null }])).toBe("SOCIETY");
  });
});
