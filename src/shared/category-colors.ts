import type { Category } from "@/generated/prisma/enums";

/**
 * One muted accent per category, used as a CSS custom property (--cat) so
 * Tailwind's static `[var(--cat)]` arbitrary-value classes stay analyzable
 * at build time while the actual color varies per item at runtime.
 */
export const CATEGORY_ACCENT: Record<Category, string> = {
  POLITICS: "oklch(0.5 0.09 260)",
  ECONOMY: "oklch(0.58 0.13 80)",
  IMMIGRATION: "oklch(0.55 0.09 190)",
  BERLIN: "oklch(0.55 0.16 25)",
  TECHNOLOGY: "oklch(0.5 0.12 290)",
  EUROPE: "oklch(0.6 0.09 230)",
  BUSINESS: "oklch(0.5 0.08 145)",
  SOCIETY: "oklch(0.6 0.11 50)",
  SPORTS: "oklch(0.55 0.12 155)",
};
