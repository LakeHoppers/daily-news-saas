import type { Category } from "@/generated/prisma/enums";
import type { SubscriptionPlan } from "@/generated/prisma/enums";

/**
 * Free/Pro gating rules (per ROADMAP.md M7: "Pro = all categories + earlier delivery").
 * Free users pick from a limited number of categories and can only receive
 * their digest at a fixed, later hour; Pro is unrestricted.
 */
export const FREE_MAX_CATEGORIES = 1;
export const FREE_DIGEST_HOUR = 9;

export function clampCategoriesForPlan(
  categories: Category[],
  plan: SubscriptionPlan,
): Category[] {
  if (plan === "PRO") return categories;
  return categories.slice(0, FREE_MAX_CATEGORIES);
}

export function clampDigestHourForPlan(digestHour: number, plan: SubscriptionPlan): number {
  if (plan === "PRO") return digestHour;
  return FREE_DIGEST_HOUR;
}
