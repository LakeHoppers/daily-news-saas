import { derivePlan, mapStripeStatus } from "../domain/status-mapping";
import type { BillingRepository } from "./ports";

export interface StripeSubscriptionEvent {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: Date | null;
}

export interface SyncSubscriptionResult {
  synced: boolean;
}

export class SyncSubscriptionUseCase {
  constructor(private readonly repository: BillingRepository) {}

  async execute(event: StripeSubscriptionEvent): Promise<SyncSubscriptionResult> {
    const userId = await this.repository.findUserIdByStripeCustomerId(event.stripeCustomerId);
    if (!userId) {
      // Unknown customer (e.g. a Stripe test event for a customer created outside our flow) — nothing to sync.
      return { synced: false };
    }

    await this.repository.upsertSubscription(userId, {
      stripeCustomerId: event.stripeCustomerId,
      stripeSubscriptionId: event.stripeSubscriptionId,
      plan: derivePlan(event.status),
      status: mapStripeStatus(event.status),
      currentPeriodEnd: event.currentPeriodEnd,
    });

    return { synced: true };
  }
}
