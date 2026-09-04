import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma/enums";

export interface StripeGateway {
  createCustomer(input: { email: string; userId: string }): Promise<string>;
  createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string>;
}

export interface SubscriptionSyncInput {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
}

export interface BillingRepository {
  getStripeCustomerId(userId: string): Promise<string | null>;
  saveStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void>;
  findUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null>;
  upsertSubscription(userId: string, input: SubscriptionSyncInput): Promise<void>;
}
