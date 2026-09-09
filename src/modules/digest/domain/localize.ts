import type { Locale } from "@/shared/locale";
export type { Locale } from "@/shared/locale";

/** English falls back to Turkish per-field when a story hasn't been translated yet. */
export function pickLocalizedText(
  locale: Locale,
  turkish: string,
  english: string | null | undefined,
): string {
  if (locale === "en" && english) return english;
  return turkish;
}
