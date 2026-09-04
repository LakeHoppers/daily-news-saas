import { NextResponse } from "next/server";
import {
  ForbiddenError,
  requireAdmin,
  UnauthorizedError,
} from "@/shared/api-guards";
import { recordAuditLog } from "@/shared/audit-log";
import { prisma } from "@/shared/prisma";

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
  const existing = await prisma.summary.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Summary not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));

  const { _max } = await prisma.summary.aggregate({
    where: { storyId: existing.storyId },
    _max: { version: true },
  });
  const nextVersion = (_max.version ?? existing.version) + 1;

  const newSummary = await prisma.summary.create({
    data: {
      storyId: existing.storyId,
      headline: typeof body.headline === "string" ? body.headline : existing.headline,
      body: typeof body.body === "string" ? body.body : existing.body,
      whyItMatters:
        typeof body.whyItMatters === "string" ? body.whyItMatters : existing.whyItMatters,
      tags: Array.isArray(body.tags)
        ? body.tags.filter((t: unknown): t is string => typeof t === "string")
        : existing.tags,
      aiProvider: existing.aiProvider,
      aiModel: existing.aiModel,
      version: nextVersion,
      editedByAdmin: true,
      editedById: admin.id,
    },
  });

  await recordAuditLog({
    adminId: admin.id,
    action: "edit_summary",
    targetId: newSummary.id,
    metadata: { storyId: existing.storyId, previousVersion: existing.version, newVersion: nextVersion },
  });

  return NextResponse.json(newSummary);
}
