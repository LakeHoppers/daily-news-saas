import { NextResponse } from "next/server";
import { requireCronSecret, UnauthorizedError } from "@/shared/api-guards";
import { runPipeline } from "@/pipeline/orchestrator";

// Hobby maximum with Fluid Compute enabled (Vercel docs, September 2026).
export const maxDuration = 300;

async function handle(request: Request) {
  try {
    requireCronSecret(request);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const result = await runPipeline();
  return NextResponse.json(result, { status: 202 });
}

// Vercel Cron invokes this path with GET. POST is kept for manual/local triggering.
export const GET = handle;
export const POST = handle;
