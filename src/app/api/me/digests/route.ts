import { NextResponse } from "next/server";
import { getOrCreateCurrentUser, UnauthorizedError } from "@/shared/api-guards";
import { getDigestHistory } from "@/modules/digest/infrastructure/digest-view";

const DEFAULT_HISTORY_LIMIT = 14;

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const categories = user.preference?.favoriteCategories ?? [];

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Number(searchParams.get("limit")) || DEFAULT_HISTORY_LIMIT,
      50,
    );

    const digests = await getDigestHistory(categories, limit);
    return NextResponse.json({ digests });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }
}
