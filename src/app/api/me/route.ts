import { NextResponse } from "next/server";
import { getOrCreateCurrentUser, UnauthorizedError } from "@/shared/api-guards";
import { prisma } from "@/shared/prisma";

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();
    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      preference: user.preference,
      subscription: subscription
        ? { plan: subscription.plan, status: subscription.status }
        : { plan: "FREE", status: "ACTIVE" },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }
}
