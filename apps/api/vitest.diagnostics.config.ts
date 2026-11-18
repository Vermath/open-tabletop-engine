import { defineConfig } from "vitest/config";
import { diagnosticFixtureTestFile } from "./vitest.config.js";

export default defineConfig({
  test: {
    name: "api-intentional-timeout-diagnostic",
    include: [diagnosticFixtureTestFile],
    pool: "forks",
    maxWorkers: 1,
    setupFiles: ["src/vitest.setup.ts"],
    retry: 0,
    testTimeout: 3_000
  }
});
