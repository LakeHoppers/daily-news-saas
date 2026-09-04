import type { Prisma } from "@/generated/prisma/client";
import type { Category } from "@/generated/prisma/enums";
import { prisma } from "@/shared/prisma";
import type { DigestView } from "../domain/types";

function digestItemsInclude(categories: Category[]) {
  return {
    where: categories.length > 0 ? { story: { category: { in: categories } } } : undefined,
    orderBy: { rank: "asc" as const },
    include: {
      story: {
        include: {
          summaries: { orderBy: { version: "desc" as const }, take: 1 },
          rawArticles: { select: { url: true } },
        },
      },
    },
  } satisfies Prisma.Digest$itemsArgs;
}

const DIGEST_INCLUDE = { items: digestItemsInclude([]) } satisfies Prisma.DigestInclude;

type DigestWithItems = Prisma.DigestGetPayload<{
  include: { items: ReturnType<typeof digestItemsInclude> };
}>;

function toDigestView(digest: DigestWithItems): DigestView {
  return {
    digestId: digest.id,
    date: digest.date.toISOString().slice(0, 10),
    items: digest.items.map((item) => {
      const summary = item.story.summaries[0];
      return {
        rank: item.rank,
        storyId: item.storyId,
        category: item.story.category,
        headline: summary?.headline ?? "",
        summary: summary?.body ?? "",
        whyItMatters: summary?.whyItMatters ?? "",
        tags: summary?.tags ?? [],
        sourceUrls: item.story.rawArticles.map((article) => article.url),
      };
    }),
  };
}

/** The most recent digest, optionally filtered to a set of favorite categories (empty = all). */
export async function getLatestDigest(categories: Category[] = []): Promise<DigestView | null> {
  const digest = await prisma.digest.findFirst({
    orderBy: { date: "desc" },
    include: { items: digestItemsInclude(categories) },
  });
  return digest ? toDigestView(digest) : null;
}

export async function getDigestByDate(date: Date): Promise<DigestView | null> {
  const digest = await prisma.digest.findUnique({
    where: { date },
    include: DIGEST_INCLUDE,
  });
  return digest ? toDigestView(digest) : null;
}

export interface DigestHistoryItem {
  date: string;
  items: { rank: number; storyId: string; category: Category; headline: string }[];
}

/** Recent digest history, optionally filtered to a set of favorite categories (empty = all). */
export async function getDigestHistory(
  categories: Category[],
  limit: number,
): Promise<DigestHistoryItem[]> {
  const digests = await prisma.digest.findMany({
    orderBy: { date: "desc" },
    take: limit,
    include: {
      items: {
        where: categories.length > 0 ? { story: { category: { in: categories } } } : undefined,
        orderBy: { rank: "asc" },
        include: {
          story: { include: { summaries: { orderBy: { version: "desc" }, take: 1 } } },
        },
      },
    },
  });

  return digests.map((digest) => ({
    date: digest.date.toISOString().slice(0, 10),
    items: digest.items.map((item) => ({
      rank: item.rank,
      storyId: item.storyId,
      category: item.story.category,
      headline: item.story.summaries[0]?.headline ?? "",
    })),
  }));
}
