import { NextResponse } from "next/server";
import { getLatestDigest } from "@/modules/digest/infrastructure/digest-view";
import type { Locale } from "@/modules/digest/domain/localize";

export async function GET(request: Request) {
  const lang = new URL(request.url).searchParams.get("lang");
  const locale: Locale = lang === "en" ? "en" : "tr";
  const digest = await getLatestDigest([], locale);
  if (!digest) {
    return NextResponse.json({ error: "No digest available yet" }, { status: 404 });
  }
  return NextResponse.json(digest);
}
