import { NextResponse } from "next/server";
import { Category } from "@/generated/prisma/enums";
import { getOrCreateCurrentUser, UnauthorizedError } from "@/shared/api-guards";
import { prisma } from "@/shared/prisma";
import { isValidTimezone } from "@/shared/timezone";
import { clampCategoriesForPlan, clampDigestHourForPlan } from "@/modules/billing/domain/plan-limits";

const CATEGORY_VALUES = new Set<string>(Object.values(Category));

export async function PATCH(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const body = await request.json();

    const data: {
      favoriteCategories?: Category[];
      digestHour?: number;
      timezone?: string;
      paused?: boolean;
    } = {};

    if (Array.isArray(body.favoriteCategories)) {
      const categories = body.favoriteCategories.filter(
        (value: unknown): value is Category =>
          typeof value === "string" && CATEGORY_VALUES.has(value),
      );
      data.favoriteCategories = categories;
    }
    if (typeof body.digestHour === "number" && body.digestHour >= 0 && body.digestHour <= 23) {
      data.digestHour = body.digestHour;
    }
    if (typeof body.timezone === "string" && isValidTimezone(body.timezone)) {
      data.timezone = body.timezone;
    }
    if (typeof body.paused === "boolean") {
      data.paused = body.paused;
    }

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    const plan = subscription?.plan ?? "FREE";

    if (data.favoriteCategories) {
      data.favoriteCategories = clampCategoriesForPlan(data.favoriteCategories, plan);
    }
    if (data.digestHour !== undefined) {
      data.digestHour = clampDigestHourForPlan(data.digestHour, plan);
    }

    const preference = await prisma.userPreference.update({
      where: { userId: user.id },
      data,
    });

    return NextResponse.json(preference);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }
}
