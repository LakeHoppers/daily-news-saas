import { NextResponse } from "next/server";
import {
  ForbiddenError,
  requireAdmin,
  UnauthorizedError,
} from "@/shared/api-guards";
import { recordAuditLog } from "@/shared/audit-log";
import { runPipeline } from "@/pipeline/orchestrator";

export async function POST() {
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

  const result = await runPipeline();
  await recordAuditLog({
    adminId: admin.id,
    action: "force_refresh",
    targetId: result.pipelineRunId,
  });
  return NextResponse.json(result, { status: 202 });
}
