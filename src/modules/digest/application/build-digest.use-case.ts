import { startOfUtcDay } from "../domain/date";
import type { DigestBuilderRepository } from "./ports";

const CANDIDATE_WINDOW_HOURS = 48;
const MAX_DIGEST_ITEMS = 30;

export interface BuildDigestResult {
  digestId: string;
  itemCount: number;
}

export class BuildDigestUseCase {
  constructor(private readonly repository: DigestBuilderRepository) {}

  async execute(date: Date = new Date()): Promise<BuildDigestResult> {
    const candidates = await this.repository.getUnusedSummarizedStories(
      CANDIDATE_WINDOW_HOURS,
      MAX_DIGEST_ITEMS,
    );

    const rankedStoryIds = [...candidates]
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .map((candidate) => candidate.storyId);

    return this.repository.upsertDigestForDate(startOfUtcDay(date), rankedStoryIds);
  }
}
