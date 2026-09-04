import type { Embedder } from "@/shared/ai-provider.interface";

const EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const MODEL = "text-embedding-3-small";
// Truncated dimensions keep clustering fast/cheap; 256 is plenty for cosine-similarity dedup.
const DIMENSIONS = 256;

interface OpenAIEmbeddingsResponse {
  data: { embedding: number[] }[];
}

export class OpenAIEmbedder implements Embedder {
  constructor(private readonly apiKey: string = process.env.OPENAI_API_KEY ?? "") {}

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const response = await fetch(EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, input: text, dimensions: DIMENSIONS }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI embeddings request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as OpenAIEmbeddingsResponse;
    return data.data[0].embedding;
  }
}
