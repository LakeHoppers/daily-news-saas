import { describe, expect, it } from "vitest";
import { CreateCheckoutSessionUseCase } from "@/modules/billing/application/create-checkout-session.use-case";
import {
  CreatePortalSessionUseCase,
  NoStripeCustomerError,
} from "@/modules/billing/application/create-portal-session.use-case";
import { SyncSubscriptionUseCase } from "@/modules/billing/application/sync-subscription.use-case";
import type {
  BillingRepository,
  StripeGateway,
  SubscriptionSyncInput,
} from "@/modules/billing/application/ports";

class FakeBillingRepository implements BillingRepository {
  customerIdsByUser = new Map<string, string>();
  userIdsByCustomer = new Map<string, string>();
  upserts: { userId: string; input: SubscriptionSyncInput }[] = [];

  async getStripeCustomerId(userId: string) {
    return this.customerIdsByUser.get(userId) ?? null;
  }
  async saveStripeCustomerId(userId: string, stripeCustomerId: string) {
    this.customerIdsByUser.set(userId, stripeCustomerId);
    this.userIdsByCustomer.set(stripeCustomerId, userId);
  }
  async findUserIdByStripeCustomerId(stripeCustomerId: string) {
    return this.userIdsByCustomer.get(stripeCustomerId) ?? null;
  }
  async upsertSubscription(userId: string, input: SubscriptionSyncInput) {
    this.upserts.push({ userId, input });
  }
}

class FakeStripeGateway implements StripeGateway {
  createCustomerCalls: { email: string; userId: string }[] = [];
  async createCustomer(input: { email: string; userId: string }) {
    this.createCustomerCalls.push(input);
    return `cus_${input.userId}`;
  }
  async createCheckoutSession(input: { customerId: string; priceId: string }) {
    return `https://checkout.stripe.com/${input.customerId}/${input.priceId}`;
  }
  async createPortalSession(input: { customerId: string }) {
    return `https://billing.stripe.com/${input.customerId}`;
  }
}

describe("CreateCheckoutSessionUseCase", () => {
  it("creates a Stripe customer on first checkout and reuses it afterward", async () => {
    const repository = new FakeBillingRepository();
    const stripe = new FakeStripeGateway();
    const useCase = new CreateCheckoutSessionUseCase(repository, stripe);

    const url1 = await useCase.execute({
      userId: "u1",
      email: "u1@example.de",
      priceId: "price_pro",
      successUrl: "https://app/success",
      cancelUrl: "https://app/cancel",
    });

    expect(stripe.createCustomerCalls).toHaveLength(1);
    expect(url1).toContain("cus_u1");
    expect(repository.customerIdsByUser.get("u1")).toBe("cus_u1");

    await useCase.execute({
      userId: "u1",
      email: "u1@example.de",
      priceId: "price_pro",
      successUrl: "https://app/success",
      cancelUrl: "https://app/cancel",
    });

    // Second call reuses the existing customer instead of creating a new one.
    expect(stripe.createCustomerCalls).toHaveLength(1);
  });
});

describe("CreatePortalSessionUseCase", () => {
  it("returns a portal URL for an existing customer", async () => {
    const repository = new FakeBillingRepository();
    await repository.saveStripeCustomerId("u1", "cus_u1");

    const url = await new CreatePortalSessionUseCase(repository, new FakeStripeGateway()).execute({
      userId: "u1",
      returnUrl: "https://app/dashboard",
    });

    expect(url).toContain("cus_u1");
  });

  it("throws NoStripeCustomerError when the user has never checked out", async () => {
    const repository = new FakeBillingRepository();
    const useCase = new CreatePortalSessionUseCase(repository, new FakeStripeGateway());

    await expect(
      useCase.execute({ userId: "unknown", returnUrl: "https://app/dashboard" }),
    ).rejects.toThrow(NoStripeCustomerError);
  });
});

describe("SyncSubscriptionUseCase", () => {
  it("syncs plan and status for a known customer", async () => {
    const repository = new FakeBillingRepository();
    await repository.saveStripeCustomerId("u1", "cus_u1");

    const result = await new SyncSubscriptionUseCase(repository).execute({
      stripeCustomerId: "cus_u1",
      stripeSubscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ synced: true });
    expect(repository.upserts).toEqual([
      {
        userId: "u1",
        input: {
          stripeCustomerId: "cus_u1",
          stripeSubscriptionId: "sub_1",
          plan: "PRO",
          status: "ACTIVE",
          currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
        },
      },
    ]);
  });

  it("does nothing for an unknown Stripe customer", async () => {
    const repository = new FakeBillingRepository();

    const result = await new SyncSubscriptionUseCase(repository).execute({
      stripeCustomerId: "cus_unknown",
      stripeSubscriptionId: "sub_x",
      status: "active",
      currentPeriodEnd: null,
    });

    expect(result).toEqual({ synced: false });
    expect(repository.upserts).toHaveLength(0);
  });

  it("downgrades to FREE when a subscription is canceled", async () => {
    const repository = new FakeBillingRepository();
    await repository.saveStripeCustomerId("u1", "cus_u1");

    await new SyncSubscriptionUseCase(repository).execute({
      stripeCustomerId: "cus_u1",
      stripeSubscriptionId: "sub_1",
      status: "canceled",
      currentPeriodEnd: null,
    });

    expect(repository.upserts[0].input.plan).toBe("FREE");
    expect(repository.upserts[0].input.status).toBe("CANCELED");
  });
});
