import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("API Vitest performance isolation", () => {
  it("runs the strict performance gate after parallel functional test files in one fork", () => {
    const config = readFileSync(join(process.cwd(), "vitest.config.ts"), "utf8");
    const functionalGroup = config.indexOf("sequence: { groupOrder: 0 }");
    const performanceGroup = config.indexOf("sequence: { groupOrder: 1 }");

    expect(config).toContain('exclude: [performanceTestFile]');
    expect(config).toContain('include: [performanceTestFile]');
    expect(config).toContain('pool: "forks"');
    expect(config).toContain("singleFork: true");
    expect(config).toContain("maxWorkers: 6");
    expect(functionalGroup).toBeGreaterThanOrEqual(0);
    expect(performanceGroup).toBeGreaterThan(functionalGroup);
  });
});
