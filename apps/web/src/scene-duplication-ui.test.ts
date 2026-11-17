import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");

function functionSource(name: string, nextName: string): string {
  return appSource.slice(appSource.indexOf(`  async function ${name}`), appSource.indexOf(`  async function ${nextName}`));
}

describe("scene and campaign duplication UI", () => {
  it("uses the dedicated campaign duplication command instead of browser export/import", () => {
    const source = functionSource("duplicateSelectedCampaign", "deleteSelectedCampaign");
    expect(source).toContain("/duplicate");
    expect(source).toContain("expectedUpdatedAt: sourceCampaign.updatedAt");
    expect(source).not.toContain("/export?");
    expect(source).not.toContain("/api/v1/import/campaign");
  });

  it("previews and commits one selected scene graph command", () => {
    const source = functionSource("duplicateSelectedPrepScenes", "moveSelectedScene");
    expect(source).toContain("/scene-duplications");
    expect(source).toContain("dryRun: true");
    expect(source).toContain("dryRun: false");
    expect(source).toContain("setSceneDuplicationReview({ request, plan: result.plan })");
    expect(source).not.toContain("for (const scene of selectedPrepScenes)");
    expect(source).not.toContain("/scenes`, payload");
  });

  it("keeps single-scene duplication on the same atomic graph API and renders exact review controls", () => {
    const source = functionSource("duplicateSelectedScene", "deleteScene");
    expect(source).toContain("/scene-duplications");
    expect(source).toContain("name: sceneDuplicateName.trim()");
    expect(appSource).toContain('aria-label="Scene duplication review"');
    expect(appSource).toContain("Confirm duplicate selected scenes");
    expect(appSource).toContain('aria-label="Skipped scene duplication references"');
  });
});
