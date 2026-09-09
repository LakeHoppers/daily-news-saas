import type {
  TranslateInput,
  TranslateOutput,
  Translator,
} from "@/shared/ai-provider.interface";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_TRANSLATOR_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You translate an already-written Turkish news digest item into natural, fluent English for expats and English-speaking readers following Germany. Do not summarize further or add/remove information — translate faithfully, but write as a native English news editor would, not word-for-word. Turkish "YZ" (yapay zekâ) means artificial intelligence — always render it as "AI" in English, never leave it as "YZ" or translate it literally.

Respond with JSON only, in this exact shape:
{
  "headline": string,
  "body": string,
  "whyItMatters": string
}`;

export class OpenAITranslator implements Translator {
  constructor(private readonly apiKey: string = process.env.OPENAI_API_KEY ?? "") {}

  async translate(input: TranslateInput): Promise<TranslateOutput> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const userContent = JSON.stringify(input);

    const response = await fetch(CHAT_URL, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_TRANSLATOR_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI translation failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI translation returned no message content");
    }

    const parsed: unknown = JSON.parse(content);
    if (
      !parsed || typeof parsed !== "object" ||
      !("headline" in parsed) || typeof parsed.headline !== "string" || !parsed.headline.trim() ||
      !("body" in parsed) || typeof parsed.body !== "string" || !parsed.body.trim() ||
      !("whyItMatters" in parsed) || typeof parsed.whyItMatters !== "string" || !parsed.whyItMatters.trim()
    ) {
      throw new Error("OpenAI translation returned an incomplete result");
    }

    return {
      headline: parsed.headline,
      body: parsed.body,
      whyItMatters: parsed.whyItMatters,
    };
  }
}
