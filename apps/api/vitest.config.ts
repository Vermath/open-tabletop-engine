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
    // Each functional worker transforms the full API graph. Keep Windows CI and
    // developer runs below the 16-logical-core default that can exhaust worker
    // startup resources while preserving useful file-level parallelism.
    maxWorkers: 6,
    projects: [apiFunctionalTestProject, apiPerformanceTestProject]
  }
});
