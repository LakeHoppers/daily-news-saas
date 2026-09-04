import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * Stripe's actual Subscription.Status values (installed SDK v22):
 * 'active' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'paused' | 'trialing' | 'unpaid'
 */
export function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
    case "unpaid":
      return "CANCELED";
    default:
      // incomplete / paused: no active entitlement yet, but not a hard cancellation either.
      return "PAST_DUE";
  }
}

export function derivePlan(stripeStatus: string): SubscriptionPlan {
  return stripeStatus === "active" || stripeStatus === "trialing" ? "PRO" : "FREE";
}
