import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "content-import-panel.tsx"), "utf8");

describe("ContentImportPanel PDF import controls", () => {
  it("exposes a PDF upload path for AI-assisted content import", () => {
    expect(source).toContain("onAnalyzePdf");
    expect(source).toContain('accept="application/pdf"');
    expect(source).toContain("Analyze PDF");
    expect(source).toContain("Codex PDF");
  });
});
