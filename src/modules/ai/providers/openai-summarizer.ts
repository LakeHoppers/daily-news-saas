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

You will be given a list of verified facts about a single news story, the source URLs they came from, and a candidate category. Using ONLY the given facts — never invent details not present in them — write a natural, fluent Turkish news item. Do not write a literal translation; write as a Turkish editor would. Never leave a German word/abbreviation untranslated in the Turkish output — e.g. German "KI" (Künstliche Intelligenz) must become Turkish "YZ" (yapay zekâ), never "KI".

Respond with JSON only, in this exact shape:
{
  "headline": string,        // a concise, natural Turkish headline
  "body": string,             // 2-3 paragraphs in fluent Turkish summarizing the story
  "whyItMatters": string,     // one short paragraph in Turkish: why this matters to someone living in or following Germany
  "category": string,         // exactly one of: ${[...CATEGORY_VALUES].join(", ")}
  "tags": string[]            // 2-5 short Turkish tags/keywords
}

The candidate category is only a weak hint derived from which outlet reported
the story, not from its actual content — general-interest German outlets
cover every topic, so a Tagesspiegel (Berlin) or Handelsblatt (Economy)
byline does not mean the story is about Berlin or the economy. Classify
"category" strictly by what the facts are actually about; only fall back to
the candidate when the facts are genuinely ambiguous between two categories.
BERLIN specifically means the story's subject is Berlin the city/state
government or a specific Berlin institution/neighborhood/incident — not
merely that a Berlin-based outlet reported it, and not because a wire-service
dateline like "Berlin (dpa)" appears in the source text: German national
outlets and news agencies routinely dateline stories from Berlin regardless
of the story's actual topic (an insulin factory in Frankfurt, a WHO health
warning, a national labor-market study are not Berlin news just because a
Berlin-based wire service filed them). When in doubt between BERLIN and a
topical category, prefer the topical category.

For "whyItMatters": this text is later translated into English verbatim for
non-Turkish expat readers, so write for anyone living in or following
Germany generally — not specifically the Turkish community. A reason framed
around "the Turkish community in Germany" reads as irrelevant once
translated for a German, American, or other non-Turkish expat reader. State
the specific, concrete mechanism connecting this exact story to a
Germany-based reader — a financial effect, a safety or legal change, a
policy precedent, a career or business angle, a health risk, something they
might act on or watch — not a generic claim that the topic "matters to
[some group]." Only invoke a Turkish-specific angle (Turkey-Germany
relations, the Turkish diaspora specifically) when the story is genuinely
about that — don't manufacture one for a story that doesn't have it. Do not
open with a reflexive phrase like "Almanya'da(ki) yaşayan
Türkler/Türk toplumu için..." — get straight to the actual reason. This item
will be read alongside nine other summaries the same morning, so vary your
opening words and sentence structure from what a generic template would
produce; if a story is genuinely just background interest with no concrete
stakes, say that plainly instead of manufacturing relevance.`;

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
