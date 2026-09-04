import "dotenv/config";
import { prisma } from "../src/shared/prisma";

async function main() {
  const run = await prisma.pipelineRun.findFirst({ orderBy: { startedAt: "desc" } });
  console.log("Latest pipeline run:", run);

  const [summaryCount, unsummarizedCount] = await Promise.all([
    prisma.summary.count(),
    prisma.story.count({ where: { summaries: { none: {} } } }),
  ]);
  console.log("Total summaries so far:", summaryCount, "| stories still unsummarized:", unsummarizedCount);

  const digest = await prisma.digest.findFirst({
    orderBy: { date: "desc" },
    include: { items: true },
  });
  console.log("Latest digest date:", digest?.date, "items:", digest?.items.length);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
