import { runSmallGroupCapacityGate } from "./small-group-capacity.js";

try {
  const result = await runSmallGroupCapacityGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
} catch (error) {
  const failure = {
    schema:
      "https://open-tabletop-engine.local/schemas/small-group-capacity-error-v1",
    schemaVersion: "1.0.0",
    kind: "small-group-capacity-gate",
    generatedAt: new Date().toISOString(),
    passed: false,
    error: {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    },
    caveat:
      "The local capacity harness failed before it could produce a complete result. This is not a production observation.",
  };
  process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
}
