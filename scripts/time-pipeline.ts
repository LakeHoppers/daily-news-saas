import "dotenv/config";
import { runPipeline } from "../src/pipeline/orchestrator";
import { prisma } from "../src/shared/prisma";

async function main() {
  const started = performance.now();
  const heartbeat = setInterval(() => console.log(`Pipeline still running: ${Math.round((performance.now() - started) / 1000)}s`), 30000);
  try {
    const result = await runPipeline();
    console.log(JSON.stringify({ durationSeconds: (performance.now() - started) / 1000, ...result }, null, 2));
  } catch (error) {
    console.error(`Pipeline failed after ${(performance.now() - started) / 1000}s (${error instanceof Error ? error.name : "unknown error"}); inspect PipelineRun privately.`);
    process.exitCode = 1;
  } finally {
    clearInterval(heartbeat);
    await prisma.$disconnect();
  }
}
void main();
