import type { BillingRepository, StripeGateway } from "./ports";

export class NoStripeCustomerError extends Error {}

export class CreatePortalSessionUseCase {
  constructor(
    private readonly repository: BillingRepository,
    private readonly stripe: StripeGateway,
  ) {}

  async execute(input: { userId: string; returnUrl: string }): Promise<string> {
    const customerId = await this.repository.getStripeCustomerId(input.userId);
    if (!customerId) {
      throw new NoStripeCustomerError("This user has no Stripe customer yet");
    }
    return this.stripe.createPortalSession({ customerId, returnUrl: input.returnUrl });
  }
}
