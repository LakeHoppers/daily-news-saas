import Stripe from "stripe";
import type { StripeGateway } from "../application/ports";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) throw new Error("STRIPE_SECRET_KEY is not set");
    stripeClient = new Stripe(apiKey);
  }
  return stripeClient;
}

export class RealStripeGateway implements StripeGateway {
  async createCustomer(input: { email: string; userId: string }): Promise<string> {
    const customer = await getStripeClient().customers.create({
      email: input.email,
      metadata: { userId: input.userId },
    });
    return customer.id;
  }

  async createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const session = await getStripeClient().checkout.sessions.create({
      customer: input.customerId,
      mode: "subscription",
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout session URL");
    }
    return session.url;
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string> {
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return session.url;
  }
}
