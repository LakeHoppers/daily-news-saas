import { NextResponse } from "next/server";
import { PipelineStatus } from "@/generated/prisma/enums";
import {
  ForbiddenError,
  requireAdmin,
  UnauthorizedError,
} from "@/shared/api-guards";
import { prisma } from "@/shared/prisma";

const STATUS_VALUES = new Set<string>(Object.values(PipelineStatus));

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
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);

  const runs = await prisma.pipelineRun.findMany({
    where: status && STATUS_VALUES.has(status) ? { status: status as PipelineStatus } : undefined,
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      scrapeLogs: {
        select: {
          success: true,
          articleCount: true,
          error: true,
          source: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({ runs });
}
