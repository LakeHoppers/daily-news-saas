import { NextResponse } from "next/server";
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

function unauthorizedResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  return null;
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    const response = unauthorizedResponse(err);
    if (response) return response;
    throw err;
  }

  const sources = await prisma.source.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ sources });
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    const response = unauthorizedResponse(err);
    if (response) return response;
    throw err;
  }

  const body = await request.json().catch(() => ({}));

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (typeof body.type !== "string" || !SOURCE_TYPE_VALUES.has(body.type)) {
    return NextResponse.json(
      { error: `type must be one of: ${[...SOURCE_TYPE_VALUES].join(", ")}` },
      { status: 400 },
    );
  }
  const category =
    typeof body.category === "string" && CATEGORY_VALUES.has(body.category)
      ? (body.category as Category)
      : undefined;

  try {
    const source = await prisma.source.create({
      data: {
        name: body.name,
        url: body.url,
        type: body.type,
        category,
        trustScore: typeof body.trustScore === "number" ? body.trustScore : undefined,
        scrapeConfig: body.scrapeConfig,
      },
    });

    await recordAuditLog({
      adminId: admin.id,
      action: "create_source",
      targetId: source.id,
      metadata: { name: source.name, url: source.url },
    });

    return NextResponse.json(source, { status: 201 });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A source with that URL already exists" }, { status: 409 });
    }
    throw err;
  }
}
