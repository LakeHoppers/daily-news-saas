import { describe, expect, it } from "vitest";
import { SummarizeStoryUseCase } from "@/modules/ai/summarizer/application/summarize-story.use-case";
import type {
  StoryToSummarize,
  SummarizerRepository,
} from "@/modules/ai/summarizer/application/ports";
import type {
  ExtractFactsInput,
  ExtractFactsOutput,
  FactExtractor,
  SummarizeInput,
  SummarizeOutput,
  Summarizer,
} from "@/shared/ai-provider.interface";

class FakeFactExtractor implements FactExtractor {
  calls: ExtractFactsInput[] = [];
  constructor(
    private readonly resolve: (input: ExtractFactsInput) => ExtractFactsOutput | Error,
  ) {}
  async extractFacts(input: ExtractFactsInput): Promise<ExtractFactsOutput> {
    this.calls.push(input);
    const result = this.resolve(input);
    if (result instanceof Error) throw result;
    return result;
  }
}

function fixedFactExtractor(result: ExtractFactsOutput | Error): FakeFactExtractor {
  return new FakeFactExtractor(() => result);
}

class FakeSummarizer implements Summarizer {
  calls: SummarizeInput[] = [];
  constructor(private readonly result: SummarizeOutput | Error) {}
  async summarize(input: SummarizeInput): Promise<SummarizeOutput> {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeRepository implements SummarizerRepository {
  stories: StoryToSummarize[] = [];
  saved: { storyId: string; output: SummarizeOutput; provider: string; model: string }[] = [];

  async getStoriesNeedingSummary(limit: number) {
    return this.stories.slice(0, limit);
  }
  async saveSummary(storyId: string, output: SummarizeOutput, provider: string, model: string) {
    this.saved.push({ storyId, output, provider, model });
  }
}

const SAMPLE_OUTPUT: SummarizeOutput = {
  headline: "Başlık",
  body: "Gövde metni.",
  whyItMatters: "Neden önemli.",
  category: "POLITICS",
  tags: ["etiket1"],
};

describe("SummarizeStoryUseCase", () => {
  it("extracts facts then summarizes and persists the result per story", async () => {
    const repository = new FakeRepository();
    repository.stories = [
      {
        storyId: "story-1",
        candidateCategory: "POLITICS",
        articles: [{ title: "T", content: "C", sourceUrl: "https://example.de/a" }],
      },
    ];

    const factExtractor = fixedFactExtractor({ facts: ["fact one"] });
    const summarizer = new FakeSummarizer(SAMPLE_OUTPUT);

    const useCase = new SummarizeStoryUseCase(
      repository,
      factExtractor,
      summarizer,
      "openai",
      "gpt-4o-mini",
    );

    const result = await useCase.execute();

    expect(result).toEqual({ summarized: 1, failed: 0 });
    expect(summarizer.calls[0]).toEqual({
      sourceFacts: ["fact one"],
      sourceUrls: ["https://example.de/a"],
      candidateCategory: "POLITICS",
    });
    expect(repository.saved).toEqual([
      { storyId: "story-1", output: SAMPLE_OUTPUT, provider: "openai", model: "gpt-4o-mini" },
    ]);
  });

  it("isolates a failing story from the rest: one fails, the other still summarizes", async () => {
    const repository = new FakeRepository();
    repository.stories = [
      { storyId: "broken", candidateCategory: "SOCIETY", articles: [] },
      {
        storyId: "ok",
        candidateCategory: "ECONOMY",
        articles: [{ title: "T", content: "C", sourceUrl: "https://example.de/b" }],
      },
    ];

    const factExtractor = new FakeFactExtractor((input) =>
      input.articles.length === 0
        ? new Error("no articles to extract facts from")
        : { facts: ["fact one"] },
    );

    const useCase = new SummarizeStoryUseCase(
      repository,
      factExtractor,
      new FakeSummarizer(SAMPLE_OUTPUT),
      "openai",
      "gpt-4o-mini",
    );

    const result = await useCase.execute();

    expect(result).toEqual({ summarized: 1, failed: 1 });
    expect(repository.saved.map((s) => s.storyId)).toEqual(["ok"]);
  });

  it("does nothing when no stories need summarizing", async () => {
    const repository = new FakeRepository();
    const useCase = new SummarizeStoryUseCase(
      repository,
      fixedFactExtractor({ facts: [] }),
      new FakeSummarizer(SAMPLE_OUTPUT),
      "openai",
      "gpt-4o-mini",
    );
    expect(await useCase.execute()).toEqual({ summarized: 0, failed: 0 });
  });
});

it("bounds chat requests at five, keeps extraction before generation, and isolates failures", async () => {
  const repository = new FakeRepository();
  repository.stories = Array.from({ length: 15 }, (_, i) => ({
    storyId: String(i), candidateCategory: "SOCIETY",
    articles: [{ title: String(i), content: "text", sourceUrl: "https://example.de/" + i }],
  }));
  let active = 0;
  let peak = 0;
  const extracted = new Set<string>();
  async function request() {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
  }
  const save = repository.saveSummary.bind(repository);
  repository.saveSummary = async (...args) => {
    if (args[0] === "2") throw new Error("save failed");
    await save(...args);
  };
  const result = await new SummarizeStoryUseCase(repository, {
    async extractFacts(input) {
      const id = input.articles[0].title;
      await request();
      if (id === "0") throw new Error("extract failed");
      extracted.add(id);
      return { facts: [id] };
    },
  }, {
    async summarize(input) {
      const id = input.sourceFacts[0];
      expect(extracted.has(id)).toBe(true);
      await request();
      if (id === "1") throw new Error("summary failed");
      return SAMPLE_OUTPUT;
    },
  }, "openai", "test").execute();
  expect(peak).toBe(5);
  expect(result).toEqual({ summarized: 12, failed: 3 });
  expect(repository.saved.map((s) => s.storyId)).not.toContain("0");
  expect(repository.saved).toHaveLength(12);
});
