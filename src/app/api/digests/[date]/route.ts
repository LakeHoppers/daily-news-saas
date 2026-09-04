import { NextResponse } from "next/server";
import { getDigestByDate } from "@/modules/digest/infrastructure/digest-view";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;

  if (!DATE_PATTERN.test(date)) {
    return NextResponse.json(
      { error: "date must be in YYYY-MM-DD format" },
      { status: 400 },
    );
  }

  const digest = await getDigestByDate(new Date(`${date}T00:00:00.000Z`));
  if (!digest) {
    return NextResponse.json({ error: "No digest for that date" }, { status: 404 });
  }
  return NextResponse.json(digest);
}
