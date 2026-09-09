import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildDigestEmail } from "../src/modules/notification/domain/email-template";
import { derivePlan, mapStripeStatus } from "../src/modules/billing/domain/status-mapping";

async function main() {
  const path = process.argv[2];
  if (!path || resolve(path).startsWith(process.cwd() + "/")) throw new Error("Private path outside repo required");
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=10000");
  process.env.DATABASE_URL = url.href;
  const { prisma } = await import("../src/shared/prisma");
  try {
    const { getLatestDigest } = await import("../src/modules/digest/infrastructure/digest-view");
    const state = await prisma.$transaction(async tx => ({
      users: await tx.user.findMany(), preferences: await tx.userPreference.findMany(),
      subscriptions: await tx.subscription.findMany(), sources: await tx.source.findMany(),
      summaries: await tx.summary.findMany(), runs: await tx.pipelineRun.findMany(),
      scrapeLogs: await tx.scrapeLog.findMany(), auditLogs: await tx.adminAuditLog.findMany(),
      deliveries: await tx.digestDelivery.findMany(),
    }), { timeout: 60000, isolationLevel: "RepeatableRead" });
    const digest = await getLatestDigest();
    const statuses = ['active','trialing','past_due','canceled','incomplete_expired','unpaid','incomplete','paused'];
    const reference = {
      sources: await prisma.source.findMany({orderBy:{name:'asc'}}),
      runs: await prisma.pipelineRun.findMany({orderBy:{startedAt:'desc'},take:20,include:{scrapeLogs:{select:{success:true,articleCount:true,error:true,source:{select:{name:true}}}}}}),
      scrapeLogs: await prisma.scrapeLog.findMany({orderBy:{createdAt:'desc'},take:50,include:{source:{select:{name:true}}}}),
      auditLogs: await prisma.adminAuditLog.findMany({orderBy:{createdAt:'desc'},take:50,include:{admin:{select:{email:true}}}}),
      email: digest ? buildDigestEmail(digest) : null,
      statuses: statuses.map(status => ({status, plan:derivePlan(status), mapped:mapStripeStatus(status)})),
    };
    const deliveryLedger = Object.fromEntries(state.deliveries.filter(d => d.channel === "EMAIL").map(d => [`digest:${d.digestId}:${d.userId}:EMAIL`, {status:d.status}]));
    await writeFile(path, JSON.stringify({state:{...state,digest,deliveryLedger}, reference}),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({users:state.users.length,sources:state.sources.length,summaries:state.summaries.length,runs:state.runs.length,readOnly:true}));
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error("Private read snapshot failed"); process.exitCode=1; });
