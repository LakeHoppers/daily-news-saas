import { isLocale } from "@/shared/locale";
import { NextResponse } from "next/server";
import { getOrCreateCurrentUser, UnauthorizedError } from "@/shared/api-guards";
import {
  CreatePortalSessionUseCase,
  NoStripeCustomerError,
} from "@/modules/billing/application/create-portal-session.use-case";
import { PrismaBillingRepository } from "@/modules/billing/infrastructure/prisma-billing-repository";
import { RealStripeGateway } from "@/modules/billing/infrastructure/stripe-gateway";

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const body = await request.json().catch(() => ({}));
    const locale = isLocale(body?.locale) ? body.locale : "tr";
    const origin = new URL(request.url).origin;

    const url = await new CreatePortalSessionUseCase(
      new PrismaBillingRepository(),
      new RealStripeGateway(),
    ).execute({ userId: user.id, returnUrl: `${origin}/${locale}/dashboard` });

    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof NoStripeCustomerError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
