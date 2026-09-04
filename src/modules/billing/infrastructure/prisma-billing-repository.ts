import { prisma } from "@/shared/prisma";
import type { BillingRepository, SubscriptionSyncInput } from "../application/ports";

export class PrismaBillingRepository implements BillingRepository {
  async getStripeCustomerId(userId: string): Promise<string | null> {
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    return subscription?.stripeCustomerId ?? null;
  }

  async saveStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    await prisma.subscription.upsert({
      where: { userId },
      create: { userId, stripeCustomerId },
      update: { stripeCustomerId },
    });
  }

  async findUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
    const subscription = await prisma.subscription.findUnique({
      where: { stripeCustomerId },
    });
    return subscription?.userId ?? null;
  }

  async upsertSubscription(userId: string, input: SubscriptionSyncInput): Promise<void> {
    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        plan: input.plan,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd,
      },
      update: {
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        plan: input.plan,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd,
      },
    });
  }
}
