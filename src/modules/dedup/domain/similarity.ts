export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function averageVectors(vectors: number[][]): number[] {
  const dim = vectors[0]?.length ?? 0;
  const sum = new Array(dim).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dim; i++) sum[i] += vector[i];
  }
  return sum.map((value) => value / vectors.length);
}
