import { startOfUtcDay } from "../domain/date";
import type { DigestBuilderRepository } from "./ports";

const CANDIDATE_WINDOW_HOURS = 48;
const MAX_DIGEST_ITEMS = 10;
const MAX_ITEMS_PER_CATEGORY = 4;

export interface BuildDigestResult {
  digestId: string;
  itemCount: number;
  storyIds: string[];
}

export class BuildDigestUseCase {
  constructor(private readonly repository: DigestBuilderRepository) {}

  async execute(date: Date = new Date()): Promise<BuildDigestResult> {
    const candidates = await this.repository.getUnusedSummarizedStories(
      CANDIDATE_WINDOW_HOURS,
      MAX_DIGEST_ITEMS,
    );

    const ranked = [...candidates].sort((a, b) =>
      b.importanceScore - a.importanceScore ||
      (a.storyId < b.storyId ? -1 : a.storyId > b.storyId ? 1 : 0),
    );
    const counts = new Map<string, number>();
    const selected = new Set<string>();
    for (const candidate of ranked) {
      if (selected.size === MAX_DIGEST_ITEMS) break;
      const count = counts.get(candidate.category) ?? 0;
      if (count >= MAX_ITEMS_PER_CATEGORY) continue;
      selected.add(candidate.storyId);
      counts.set(candidate.category, count + 1);
    }
    // Soft cap: do not waste slots when the available categories lack variety.
    for (const candidate of ranked) {
      if (selected.size === MAX_DIGEST_ITEMS) break;
      selected.add(candidate.storyId);
    }
    const rankedStoryIds = ranked
      .filter((candidate) => selected.has(candidate.storyId))
      .map((candidate) => candidate.storyId);

    const result = await this.repository.upsertDigestForDate(startOfUtcDay(date), rankedStoryIds);
    return { ...result, storyIds: rankedStoryIds };
  }
}
