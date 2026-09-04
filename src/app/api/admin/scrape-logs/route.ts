import { NextResponse } from "next/server";
import {
  ForbiddenError,
  requireAdmin,
  UnauthorizedError,
} from "@/shared/api-guards";
import { prisma } from "@/shared/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const { searchParams } = new URL(request.url);
  const sourceId = searchParams.get("sourceId") ?? undefined;
  const successParam = searchParams.get("success");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  const logs = await prisma.scrapeLog.findMany({
    where: {
      sourceId,
      success: successParam === "true" ? true : successParam === "false" ? false : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { source: { select: { name: true } } },
  });

  return NextResponse.json({ logs });
}
