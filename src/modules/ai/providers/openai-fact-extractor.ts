import type {
  ExtractFactsInput,
  ExtractFactsOutput,
  FactExtractor,
} from "@/shared/ai-provider.interface";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a factual news analyst. You will be given raw snippets from multiple German news articles that report on the same real-world event.

Extract a concise list of verified factual bullet points using ONLY information present in the given text. Do not add speculation, opinion, or any fact not stated in the source snippets. Merge duplicate or overlapping facts across sources into a single bullet. Keep each fact short and self-contained.

Respond with JSON only, in this exact shape: {"facts": string[]}`;

export class OpenAIFactExtractor implements FactExtractor {
  constructor(private readonly apiKey: string = process.env.OPENAI_API_KEY ?? "") {}

  async extractFacts(input: ExtractFactsInput): Promise<ExtractFactsOutput> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const articlesText = input.articles
      .map((article, i) => `Source ${i + 1} (${article.sourceUrl}):\nTitle: ${article.title}\n${article.content}`)
      .join("\n---\n");

    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: articlesText },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI fact extraction failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI fact extraction returned no message content");
    }

    const parsed: unknown = JSON.parse(content);
    const facts =
      typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { facts?: unknown }).facts)
        ? (parsed as { facts: unknown[] }).facts.filter((f): f is string => typeof f === "string")
        : [];

    if (facts.length === 0) {
      throw new Error("OpenAI fact extraction returned no usable facts");
    }

    return { facts };
  }
}
