import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/prisma";

export async function recordAuditLog(input: {
  adminId: string;
  action: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetId: input.targetId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
