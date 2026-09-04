import "dotenv/config";
import { runPipeline } from "../src/pipeline/orchestrator";

async function main() {
  const result = await runPipeline();
  console.log("Pipeline result:", JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
