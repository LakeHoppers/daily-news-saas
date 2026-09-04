import { NextResponse } from "next/server";
import { getLatestDigest } from "@/modules/digest/infrastructure/digest-view";

export async function GET() {
  const digest = await getLatestDigest();
  if (!digest) {
    return NextResponse.json({ error: "No digest available yet" }, { status: 404 });
  }
  return NextResponse.json(digest);
}
