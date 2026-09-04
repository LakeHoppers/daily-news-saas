import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/modules/billing/infrastructure/stripe-gateway";
import { SyncSubscriptionUseCase } from "@/modules/billing/application/sync-subscription.use-case";
import { PrismaBillingRepository } from "@/modules/billing/infrastructure/prisma-billing-repository";

// Subscription events carry the full, authoritative subscription state, so we
// sync from those rather than also handling checkout.session.completed —
// Stripe fires customer.subscription.created around the same time anyway,
// and it has status/period info that the checkout session itself doesn't.
const HANDLED_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing stripe-signature header or STRIPE_WEBHOOK_SECRET" },
      { status: 400 },
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripeClient().webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, handled: false });
  }

  const subscription = event.data.object as Stripe.Subscription;
  const stripeCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const currentPeriodEndSeconds = subscription.items.data[0]?.current_period_end;

  const result = await new SyncSubscriptionUseCase(new PrismaBillingRepository()).execute({
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: currentPeriodEndSeconds
      ? new Date(currentPeriodEndSeconds * 1000)
      : null,
  });

  return NextResponse.json({ received: true, handled: true, synced: result.synced });
}
