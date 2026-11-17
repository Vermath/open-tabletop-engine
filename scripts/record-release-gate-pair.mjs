import { spawnSync } from "node:child_process";

const command = process.execPath;
const runId = new Date().toISOString().replace(/[-:.]/g, "");
const outputPaths = [1, 2].map((run) => `artifacts/release-evidence/${runId}-cold-check-${run}.json`);

for (let run = 1; run <= 2; run += 1) {
  console.log(`\nCold aggregate check ${run}/2`);
  const environment = {
    ...process.env,
    TURBO_FORCE: "true",
    OTTE_API_TEST_SEED: String(20_260_716 + run),
  };
  runNode([
    "scripts/record-release-evidence.mjs",
    "check",
    "--output",
    outputPaths[run - 1],
  ], environment);
}

runNode([
  "scripts/check-release-gate-evidence.mjs",
  "--require-check-pair",
  ...outputPaths,
], process.env);
console.log("\nTwo sequential TURBO_FORCE check artifacts were recorded and verified.");

function runNode(args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.stack ?? result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
