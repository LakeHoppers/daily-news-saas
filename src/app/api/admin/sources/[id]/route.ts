import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { Category, SourceType } from "@/generated/prisma/enums";
import {
  ForbiddenError,
  requireAdmin,
  UnauthorizedError,
} from "@/shared/api-guards";
import { recordAuditLog } from "@/shared/audit-log";
import { prisma } from "@/shared/prisma";

const SOURCE_TYPE_VALUES = new Set<string>(Object.values(SourceType));
const CATEGORY_VALUES = new Set<string>(Object.values(Category));

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const data: {
    name?: string;
    url?: string;
    type?: SourceType;
    category?: Category | null;
    trustScore?: number;
    active?: boolean;
    scrapeConfig?: unknown;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name;
  if (typeof body.url === "string" && body.url.trim()) data.url = body.url;
  if (typeof body.type === "string" && SOURCE_TYPE_VALUES.has(body.type)) {
    data.type = body.type as SourceType;
  }
  if (body.category === null || (typeof body.category === "string" && CATEGORY_VALUES.has(body.category))) {
    data.category = body.category;
  }
  if (typeof body.trustScore === "number") data.trustScore = body.trustScore;
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.scrapeConfig !== undefined) data.scrapeConfig = body.scrapeConfig;

  try {
    const source = await prisma.source.update({
      where: { id },
      data: data as Prisma.SourceUpdateInput,
    });

    await recordAuditLog({
      adminId: admin.id,
      action: "update_source",
      targetId: id,
      metadata: data as Record<string, unknown>,
    });

    return NextResponse.json(source);
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Source not found" }, { status: 404 });
      }
      if (err.code === "P2002") {
        return NextResponse.json({ error: "A source with that URL already exists" }, { status: 409 });
      }
    }
    throw err;
  }
}
