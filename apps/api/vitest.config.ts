import { defineConfig, defineProject } from "vitest/config";

export const performanceTestFile = "src/performance-smoke.test.ts";

export const apiFunctionalTestProject = defineProject({
  test: {
    name: "api-functional",
    include: ["src/**/*.test.ts"],
    exclude: [performanceTestFile],
    sequence: { groupOrder: 0 }
  }
});

export const apiPerformanceTestProject = defineProject({
  test: {
    name: "api-performance",
    include: [performanceTestFile],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
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
