/** Read-only TS oracle. Contains private user data: output must stay outside the repo. */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const output = process.argv[2];
  if (!output || resolve(output).startsWith(`${process.cwd()}/`)) {
    throw new Error("Specify a private output file outside the repository");
  }
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=10000");
  process.env.DATABASE_URL = url.href;
  const { prisma } = await import("../src/shared/prisma");
  try {
    const { GET: latest } = await import("../src/app/api/digests/latest/route");
    const { GET: dated } = await import("../src/app/api/digests/[date]/route");
    const { GET: story } = await import("../src/app/api/stories/[id]/route");
    const { getDigestHistory } = await import("../src/modules/digest/infrastructure/digest-view");
    const { Category } = await import("../src/generated/prisma/enums");
    const readonly = await prisma.$queryRawUnsafe("SHOW transaction_read_only");
    const cases: { path: string; status: number; body: unknown }[] = [];
    async function record(path: string, response: Response) {
      const body = await response.json();
      cases.push({ path, status: response.status, body });
      return body;
    }
    const tr = await record("/api/digests/latest", await latest(new Request("http://reference/api/digests/latest")));
    await record("/api/digests/latest?lang=en", await latest(new Request("http://reference/api/digests/latest?lang=en")));
    const dates = await prisma.digest.findMany({ orderBy: { date: "desc" }, take: 5 });
    for (const d of dates) {
      const date = d.date.toISOString().slice(0, 10);
      await record(`/api/digests/${date}`, await dated(new Request("http://reference"), { params: Promise.resolve({ date }) }));
    }
    for (const item of tr.items ?? []) {
      await record(`/api/stories/${item.storyId}`, await story(new Request("http://reference"), { params: Promise.resolve({ id: item.storyId }) }));
    }
    const histories = [];
    for (const locale of ["tr", "en"] as const) {
      for (const categories of [[], ...Object.values(Category).map(c => [c])]) {
        histories.push({ locale, categories, limit: 14, result: await getDigestHistory(categories, 14, locale) });
      }
    }
    const users = [];
    const existing = await prisma.user.findMany({ orderBy: { id: "asc" }, take: 5, include: { preference: true, subscription: true } });
    for (const user of existing) {
      users.push({ clerkId: user.clerkId, isAdmin: user.isAdmin,
        current: { id: user.id, email: user.email, preference: user.preference,
          subscription: user.subscription ? { plan: user.subscription.plan, status: user.subscription.status } : { plan: "FREE", status: "ACTIVE" } },
        history: await getDigestHistory(user.preference?.favoriteCategories ?? [], 14, "en"),
      });
    }
    await writeFile(output, JSON.stringify({ readonly, cases, histories, users }), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ publicCases: cases.length, histories: histories.length, users: users.length, readOnly: readonly }));
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error("Read comparison failed; inspect private configuration without printing secrets."); process.exitCode = 1; });
