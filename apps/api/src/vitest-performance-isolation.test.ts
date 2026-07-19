import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("API Vitest performance isolation", () => {
  it("runs the strict performance gate after parallel functional test files in one fork", () => {
    const config = readFileSync(join(process.cwd(), "vitest.config.ts"), "utf8");
    const functionalProject = config.slice(config.indexOf("apiFunctionalTestProject"), config.indexOf("apiPerformanceTestProject"));
    const performanceProject = config.slice(config.indexOf("apiPerformanceTestProject"), config.indexOf("export default"));
    const functionalGroup = config.indexOf("groupOrder: 0");
    const performanceGroup = config.indexOf("groupOrder: 1");

    expect(config).toContain('exclude: [performanceTestFile, diagnosticFixtureTestFile]');
    expect(config).toContain('include: [performanceTestFile]');
    expect(config).toContain('pool: "forks"');
    expect(config).toContain("singleFork: true");
    expect(config).toContain("maxWorkers: 2");
    expect(config).toContain('setupFiles: ["src/vitest.setup.ts"]');
    expect(config).toContain("retry: 0");
    expect(functionalProject).toContain("testTimeout: 15_000");
    expect(performanceProject).not.toContain("testTimeout");
    expect(config).toContain('shuffle: { files: true, tests: false }');
    expect(config).toContain("seed: apiFunctionalTestSeed");
    expect(config).toContain("diagnosticFixtureTestFile");
    expect(functionalGroup).toBeGreaterThanOrEqual(0);
    expect(performanceGroup).toBeGreaterThan(functionalGroup);
  });
});
