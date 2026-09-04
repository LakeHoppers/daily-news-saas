import type { BillingRepository, StripeGateway } from "./ports";

export interface CreateCheckoutSessionInput {
  userId: string;
  email: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export class CreateCheckoutSessionUseCase {
  constructor(
    private readonly repository: BillingRepository,
    private readonly stripe: StripeGateway,
  ) {}

  async execute(input: CreateCheckoutSessionInput): Promise<string> {
    let customerId = await this.repository.getStripeCustomerId(input.userId);

    if (!customerId) {
      customerId = await this.stripe.createCustomer({
        email: input.email,
        userId: input.userId,
      });
      await this.repository.saveStripeCustomerId(input.userId, customerId);
    }

    return this.stripe.createCheckoutSession({
      customerId,
      priceId: input.priceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
  }
}
