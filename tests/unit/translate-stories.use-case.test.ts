import { describe, expect, it } from "vitest";
import { TranslateStoriesUseCase } from "@/modules/ai/translator/application/translate-stories.use-case";
import type {
  SummaryToTranslate,
  TranslatorRepository,
} from "@/modules/ai/translator/application/ports";
import type { TranslateInput, TranslateOutput, Translator } from "@/shared/ai-provider.interface";

class FakeTranslator implements Translator {
  calls: TranslateInput[] = [];
  constructor(private readonly resolve: (input: TranslateInput) => TranslateOutput | Error) {}
  async translate(input: TranslateInput): Promise<TranslateOutput> {
    this.calls.push(input);
    const result = this.resolve(input);
    if (result instanceof Error) throw result;
    return result;
  }
}

class FakeRepository implements TranslatorRepository {
  summaries: SummaryToTranslate[] = [];
  published: SummaryToTranslate[] = [];
  async getPublishedUntranslatedSummaries(exclude: string[], limit: number) {
    return this.published.filter(s => !exclude.includes(s.storyId) && !this.saved.some(x => x.summaryId === s.summaryId)).slice(0, limit);
  }
  saved: { summaryId: string; output: TranslateOutput }[] = [];

  async getUntranslatedSummaries(storyIds: string[]) {
    return this.summaries.filter((s) => storyIds.includes(s.storyId));
  }
  async saveTranslation(summaryId: string, output: TranslateOutput) {
    this.saved.push({ summaryId, output });
  }
}

describe("TranslateStoriesUseCase", () => {
  it("translates the given stories' summaries and persists the result", async () => {
    const repository = new FakeRepository();
    repository.summaries = [
      {
        summaryId: "sum-1",
        storyId: "story-1",
        headline: "Başlık",
        body: "Metin",
        whyItMatters: "Önemli çünkü",
      },
    ];
    const translator = new FakeTranslator(() => ({
      headline: "Headline",
      body: "Body",
      whyItMatters: "Because it matters",
    }));

    const result = await new TranslateStoriesUseCase(repository, translator).execute(["story-1"]);

    expect(result).toEqual({ translated: 1, failed: 0 });
    expect(repository.saved).toEqual([
      {
        summaryId: "sum-1",
        output: { headline: "Headline", body: "Body", whyItMatters: "Because it matters" },
      },
    ]);
  });

  it("isolates a translation failure for one story from the rest", async () => {
    const repository = new FakeRepository();
    repository.summaries = [
      { summaryId: "sum-1", storyId: "fails", headline: "A", body: "A", whyItMatters: "A" },
      { summaryId: "sum-2", storyId: "ok", headline: "B", body: "B", whyItMatters: "B" },
    ];
    const translator = new FakeTranslator((input) =>
      input.headline === "A"
        ? new Error("rate limited")
        : { headline: "OK", body: "OK", whyItMatters: "OK" },
    );

    const result = await new TranslateStoriesUseCase(repository, translator).execute([
      "fails",
      "ok",
    ]);

    expect(result).toEqual({ translated: 1, failed: 1 });
    expect(repository.saved).toEqual([
      { summaryId: "sum-2", output: { headline: "OK", body: "OK", whyItMatters: "OK" } },
    ]);
  });

  it("does nothing when there are no story ids", async () => {
    const repository = new FakeRepository();
    const result = await new TranslateStoriesUseCase(
      repository,
      new FakeTranslator(() => ({ headline: "", body: "", whyItMatters: "" })),
    ).execute([]);
    expect(result).toEqual({ translated: 0, failed: 0 });
  });
});

 it("retries a failed published story on a later run with different selections, then stops", async () => {
   const repository = new FakeRepository();
   repository.published = [{summaryId: "old", storyId: "old-story", headline: "A", body: "B", whyItMatters: "C"}];
   let fail = true;
   const translator = new FakeTranslator(() => fail ? new Error("429") : {headline:"A",body:"B",whyItMatters:"C"});
   const useCase = new TranslateStoriesUseCase(repository, translator);
   expect(await useCase.execute(["new-story"])).toEqual({translated:0,failed:1});
   fail = false;
   expect(await useCase.execute(["another-story"])).toEqual({translated:1,failed:0});
   expect(await useCase.execute([])).toEqual({translated:0,failed:0});
 });
 it("bounds retry work to five and excludes current selections", async () => {
   const repository = new FakeRepository();
   repository.published = Array.from({length:12}, (_, i) => ({summaryId:`s${i}`,storyId:`a${i}`,headline:"A",body:"B",whyItMatters:"C"}));
   repository.summaries = [repository.published[0]];
   const translator = new FakeTranslator(() => ({headline:"A",body:"B",whyItMatters:"C"}));
   expect(await new TranslateStoriesUseCase(repository,translator).execute(["a0"])).toEqual({translated:6,failed:0});
   expect(new Set(repository.saved.map(s=>s.summaryId)).size).toBe(6);
 });
