import { defineConfig, defineProject } from "vitest/config";

export const performanceTestFile = "src/performance-smoke.test.ts";
export const diagnosticFixtureTestFile = "src/fixtures/intentional-timeout.fixture.test.ts";
export const apiFunctionalTestSeed = boundedSeed(process.env.OTTE_API_TEST_SEED) ?? 20_260_717;

export const apiFunctionalTestProject = defineProject({
  test: {
    name: "api-functional",
    include: ["src/**/*.test.ts"],
    exclude: [performanceTestFile, diagnosticFixtureTestFile],
    pool: "forks",
    setupFiles: ["src/vitest.setup.ts"],
    retry: 0,
    testTimeout: 15_000,
    sequence: {
      groupOrder: 0,
      hooks: "stack",
      shuffle: { files: true, tests: false },
      seed: apiFunctionalTestSeed
    }
  }
});

export const apiPerformanceTestProject = defineProject({
  test: {
    name: "api-performance",
    include: [performanceTestFile],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ["src/vitest.setup.ts"],
    retry: 0,
    sequence: { groupOrder: 1 }
  }
});

export default defineConfig({
  test: {
    // Each functional worker transforms the full API graph. Six workers can
    // exhaust Windows worker/RPC startup resources; two is the measured stable
    // setting for the full API suite while preserving file-level parallelism.
    maxWorkers: 2,
    projects: [apiFunctionalTestProject, apiPerformanceTestProject]
  }
});

function boundedSeed(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647 ? parsed : undefined;
}
