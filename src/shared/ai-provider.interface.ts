import type { Category } from "@/generated/prisma/enums";

export interface SummarizeInput {
  sourceFacts: string[];
  sourceUrls: string[];
  candidateCategory?: Category;
}

export interface SummarizeOutput {
  headline: string;
  body: string;
  whyItMatters: string;
  category: Category;
  tags: string[];
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

export interface Summarizer {
  summarize(input: SummarizeInput): Promise<SummarizeOutput>;
}

export interface ExtractFactsInput {
  articles: { title: string; content: string; sourceUrl: string }[];
}

export interface ExtractFactsOutput {
  facts: string[];
}

export interface FactExtractor {
  extractFacts(input: ExtractFactsInput): Promise<ExtractFactsOutput>;
}

export interface TranslateInput {
  headline: string;
  body: string;
  whyItMatters: string;
}

export interface TranslateOutput {
  headline: string;
  body: string;
  whyItMatters: string;
}

/** Translates an already-written summary — not a second summarization pass. */
export interface Translator {
  translate(input: TranslateInput): Promise<TranslateOutput>;
}

export interface AIProvider extends Embedder, Summarizer, FactExtractor {
  readonly name: string;
  readonly model: string;
}
