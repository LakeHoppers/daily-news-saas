import { NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const story = await prisma.story.findUnique({
    where: { id },
    include: {
      summaries: { orderBy: { version: "desc" }, take: 1 },
      rawArticles: {
        select: { title: true, url: true, publishedAt: true, source: { select: { name: true } } },
      },
    },
  });

  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const summary = story.summaries[0];

  return NextResponse.json({
    storyId: story.id,
    category: story.category,
    importanceScore: story.importanceScore,
    headline: summary?.headline ?? null,
    summary: summary?.body ?? null,
    whyItMatters: summary?.whyItMatters ?? null,
    tags: summary?.tags ?? [],
    sources: story.rawArticles.map((article) => ({
      title: article.title,
      url: article.url,
      publishedAt: article.publishedAt,
      sourceName: article.source.name,
    })),
  });
}
