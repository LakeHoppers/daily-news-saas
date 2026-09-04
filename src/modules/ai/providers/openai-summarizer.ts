import { Category } from "@/generated/prisma/enums";
import type {
  SummarizeInput,
  SummarizeOutput,
  Summarizer,
} from "@/shared/ai-provider.interface";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_SUMMARIZER_MODEL = "gpt-4o-mini";
const MODEL = OPENAI_SUMMARIZER_MODEL;
const CATEGORY_VALUES = new Set<string>(Object.values(Category));

const SYSTEM_PROMPT = `You are an editor producing a daily Turkish-language news digest for Turkish speakers living in or interested in Germany.

You will be given a list of verified facts about a single news story, the source URLs they came from, and a candidate category. Using ONLY the given facts — never invent details not present in them — write a natural, fluent Turkish news item. Do not write a literal translation; write as a Turkish editor would.

Respond with JSON only, in this exact shape:
{
  "headline": string,        // a concise, natural Turkish headline
  "body": string,             // 2-3 paragraphs in fluent Turkish summarizing the story
  "whyItMatters": string,     // one short paragraph in Turkish: why this matters to Turkish readers in/following Germany
  "category": string,         // exactly one of: ${[...CATEGORY_VALUES].join(", ")}
  "tags": string[]            // 2-5 short Turkish tags/keywords
}

Prefer the candidate category unless the facts clearly indicate a better fit.`;

export class OpenAISummarizer implements Summarizer {
  constructor(private readonly apiKey: string = process.env.OPENAI_API_KEY ?? "") {}

  async summarize(input: SummarizeInput): Promise<SummarizeOutput> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const userContent = [
      `Candidate category: ${input.candidateCategory ?? "unknown"}`,
      "Facts:",
      ...input.sourceFacts.map((fact) => `- ${fact}`),
      "Source URLs:",
      ...input.sourceUrls.map((url) => `- ${url}`),
    ].join("\n");

    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI summarization failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI summarization returned no message content");
    }

    const parsed = JSON.parse(content) as Partial<SummarizeOutput>;
    if (!parsed.headline || !parsed.body || !parsed.whyItMatters) {
      throw new Error("OpenAI summarization returned an incomplete result");
    }

    const category = CATEGORY_VALUES.has(parsed.category as string)
      ? (parsed.category as Category)
      : (input.candidateCategory ?? "SOCIETY");

    return {
      headline: parsed.headline,
      body: parsed.body,
      whyItMatters: parsed.whyItMatters,
      category,
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string") : [],
    };
  }
}
