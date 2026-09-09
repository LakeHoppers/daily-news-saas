import { isLocale } from "@/shared/locale";
import { NextResponse } from "next/server";
import { getOrCreateCurrentUser, UnauthorizedError } from "@/shared/api-guards";
import { CreateCheckoutSessionUseCase } from "@/modules/billing/application/create-checkout-session.use-case";
import { PrismaBillingRepository } from "@/modules/billing/infrastructure/prisma-billing-repository";
import { RealStripeGateway } from "@/modules/billing/infrastructure/stripe-gateway";

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const body = await request.json().catch(() => ({}));
    const priceId =
      typeof body.priceId === "string" ? body.priceId : process.env.STRIPE_PRO_PRICE_ID;

    if (!priceId) {
      return NextResponse.json({ error: "priceId is required" }, { status: 400 });
    }

    const locale = isLocale(body?.locale) ? body.locale : "tr";
    const origin = new URL(request.url).origin;

    const url = await new CreateCheckoutSessionUseCase(
      new PrismaBillingRepository(),
      new RealStripeGateway(),
    ).execute({
      userId: user.id,
      email: user.email,
      priceId,
      successUrl: `${origin}/${locale}/dashboard?checkout=success`,
      cancelUrl: `${origin}/${locale}/dashboard?checkout=cancelled`,
    });

    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }
}
