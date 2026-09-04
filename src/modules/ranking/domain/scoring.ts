export interface StoryRankingInput {
  distinctSourceCount: number;
  avgTrustScore: number;
  mostRecentPublishedAt: Date | null;
  now?: Date;
}

const UNKNOWN_PUBLISH_AGE_HOURS = 72;
const RECENCY_WINDOW_HOURS = 24;
const CORROBORATION_WEIGHT = 8;
const TRUST_WEIGHT = 0.6;

/**
 * Deterministic importance score: trust of corroborating sources, how many
 * distinct sources reported it, and how recently it broke. No AI involved —
 * this stays purely rule-based so it's cheap to run and easy to reason about.
 */
export function computeImportanceScore(input: StoryRankingInput): number {
  const now = input.now ?? new Date();
  const hoursSincePublished = input.mostRecentPublishedAt
    ? (now.getTime() - input.mostRecentPublishedAt.getTime()) / (60 * 60 * 1000)
    : UNKNOWN_PUBLISH_AGE_HOURS;

  const recencyBonus = Math.max(0, RECENCY_WINDOW_HOURS - hoursSincePublished);
  const corroborationBonus = Math.max(0, input.distinctSourceCount - 1) * CORROBORATION_WEIGHT;
  const score = input.avgTrustScore * TRUST_WEIGHT + corroborationBonus + recencyBonus;

  return Math.round(score * 100) / 100;
}
